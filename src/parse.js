import _ from 'lodash';

let ESCAPES = {'n':'\n', 'f':'\f', 'r':'\r', 't':'\t', 
                'v': '\v', '\'': '\'', '"': '"'};

class Lexer {
    constructor(text) {
        // Tokenization will be done here
    }

    lex(text) {
        this.text = text;
        this.index = 0;
        this.ch = undefined;
        this.tokens = [];

        while (this.index < this.text.length) {
            this.ch = this.text.charAt(this.index);
            if (this.isNumber(this.ch) || 
                (this.is('.') && this.isNumber(this.peek()))) {
                this.readNumber();
            } else if (this.is('\'"')) {
                this.readString(this.ch);
            } else if (this.is('[],{}:')) {
                this.tokens.push({
                    text: this.ch
                });
                this.index++;
            } else if (this.isIdent(this.ch)) {
                this.readIdent();
            } else if (this.isWhitespace(this.ch)) {
                this.index++;
            } else {
                throw `Unexpected next character: ${this.ch}`;
            }
        }
        return this.tokens;
    }

    is(chs) {
        return chs.indexOf(this.ch) >= 0;
    }

    isNumber(ch) {
        return '0' <= ch && ch <= '9';
    }

    readNumber() {
        let number = '';
        while (this.index < this.text.length) {
            let ch = this.text.charAt(this.index).toLowerCase();
            if (ch === '.' || this.isNumber(ch)) {
                number += ch;
            } else {
                let nextCh = this.peek();
                let prevCh = number.charAt(number.length - 1);
                if (ch === 'e' && this.isExpOperator(nextCh)) {
                    number += ch;
                } else if (this.isExpOperator(ch) && prevCh === 'e' &&
                            nextCh && this.isNumber(nextCh)) {
                    number += ch;
                } else if (this.isExpOperator(ch) && prevCh === 'e' &&
                            (!nextCh || !this.isNumber(nextCh))) {
                    throw 'Invalid exponent';
                } else {
                    break;
                }
            }
            this.index++;
        }
        this.tokens.push({
            text: number,
            value: Number(number)
        });
    }

    peek() {
        return this.index < this.text.length - 1 ? 
            this.text.charAt(this.index + 1) : 
            false;
    }

    isExpOperator(ch) {
        return ch === '-' || ch === '+' || this.isNumber(ch);
    }

    isIdent(ch) {
        return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
            ch === '_' || ch === '$';
    }

    isWhitespace(ch) {
        return ch === ' ' || ch === '\r' || ch === '\t' ||
            ch === '\n' || ch === '\v' || ch === '\u00A0';
    }

    readIdent() {
        let text = '';
        while (this.index < this.text.length) {
            let ch = this.text.charAt(this.index);
            if (this.isIdent(ch) || this.isNumber(ch)) {
                text += ch;
            } else {
                break;
            }
            this.index++;
        }
        let token = {text: text, identifier: true};
        this.tokens.push(token);
    }

    readString(quote) {
        this.index++;
        let string = '';
        let escape = false;
        while (this.index < this.text.length) {
            let ch = this.text.charAt(this.index);
            if (escape) {
                if (ch === 'u') {
                    let hex = this.text.substring(this.index + 1, this.index + 5);
                    if (!hex.match(/[\da-f]{4}/i)) {
                        throw 'Invalid unicode escape';
                    }
                    this.index += 4;
                    string += String.fromCharCode(parseInt(hex, 16));
                } else {
                    let replacement = ESCAPES[ch];
                    if (replacement) {
                        string += replacement;
                    } else {
                        string += ch;
                    }
                }
                escape = false;
            } else if (ch === quote) {
                this.index++;
                this.tokens.push({
                    text: string,
                    value: string
                });
                return;
            } else if (ch === '\\') {
                escape = true;
            } else {
                string += ch;
            }
            this.index++;
        }
        throw 'Unmatched quote';
    }
}

class AST {
    constructor(lexer) {
        this.lexer = lexer;
        this.constants = {
            'null': {type: AST.Literal, value: null},
            'true': {type: AST.Literal, value: true},
            'false': {type: AST.Literal, value: false}
        }
    }

    ast(text) {
        this.tokens = this.lexer.lex(text);
        return this.program();
    }

    program() {
        return {type: AST.Program, body: this.primary()};
    }

    primary() {
        if (this.expect('[')){
            return this.arrayDeclaration();
        } else if (this.expect('{')) {
            return this.object();
        } else if (this.constants.hasOwnProperty(this.tokens[0].text)) {
            return this.constants[this.consume().text];
        } else {
            return this.constant();
        }
    }

    constant() {
        return {type: AST.Literal, value: this.consume().value};
    }

    expect(e) {
        let token = this.peek(e);
        if (token) {
            return this.tokens.shift();
        }
    }

    arrayDeclaration() {
        let elements = [];
        if (!this.peek(']')) {
            do {
                if (this.peek(']')) {
                    break;
                }
                elements.push(this.primary());
            } while (this.expect(','));
        }
        this.consume(']');
        return {type: AST.ArrayExpression, elements: elements};
    }

    object() {
        let properties = [];
        if (!this.peek('}')) {
            do {
                let property = {type: AST.Property};
                if (this.peek().identifier) {
                    property.key = this.identifier();
                } else {
                    property.key = this.constant();
                }
                this.consume(':');
                property.value = this.primary();
                properties.push(property);
            } while (this.expect(','));
        }
        this.consume('}');
        return {type: AST.ObjectExpression, properties: properties};
    }

    peek(e) {
        if (this.tokens.length > 0) {
            let text = this.tokens[0].text;
            if (text === e || !e) {
                return this.tokens[0];
            }
        }
    }

    consume(e) {
        let token = this.expect(e);
        if (!token) {
            throw `Unexpected. Expecting ${e}`;
        }
        return token;
    }

    identifier() {
        return {type: AST.Identifier, name: this.consume().text};
    }
}

// possibly move to staic get() in AST class
AST.Program = 'Program';
AST.Literal = 'Literal';
AST.ArrayExpression = 'ArrayExpression';
AST.ObjectExpression = 'ObjectExpression';
AST.Property = 'Property';
AST.Identifier = 'Identifier';

class ASTCompiler {
    constructor(astBuilder) {
        this.astBuilder = astBuilder;
        this.stringEscapeRegex = /[^a-zA-Z0-9]/g;
    }

    compile(text) {
        let ast = this.astBuilder.ast(text);
        this.state = {body: []};
        this.recurse(ast);
        return new Function(this.state.body.join(''));
    }

    recurse(ast) {
        switch (ast.type) {
            case AST.Program:
                this.state.body.push('return ', this.recurse(ast.body), ';');
                break;
            case AST.Literal:
                return this.escape(ast.value);
            case AST.ArrayExpression:
                let elements = _.map(ast.elements, (element) => {
                                    return this.recurse(element);
                                });
                return '[' + elements.join(',') + ']';
            case AST.ObjectExpression:
                let properties = _.map(ast.properties, (property) => {
                                    let key = property.key.type === AST.Identifier ? 
                                        property.key.name :
                                        this.escape(property.key.value);
                                    let value = this.recurse(property.value);
                                    return key + ':' + value;
                                });
                return '{' + properties.join(',') + '}';
        }
    }

    escape(value) {
        if (_.isString(value)) {
            console.log(value);
            return '\'' + 
                value.replace(this.stringEscapeRegex, this.stringEscapeFn) + 
                '\'';
        } else if (_.isNull(value)) {
            return 'null';
        } else {
            return value;
        }
    }

    stringEscapeFn(c) {
        return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
    }
}

class Parser {
    constructor(lexer) {
        this.lexer = lexer;
        this.ast = new AST(this.lexer);
        this.astCompiler = new ASTCompiler(this.ast);
    }

    parse(text) {
        return this.astCompiler.compile(text);
    }
}

let parse = function(expr) {
    let lexer = new Lexer();
    let parser = new Parser(lexer);  
    return parser.parse(expr); 
}

export default parse;