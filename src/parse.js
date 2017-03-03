import _ from 'lodash';

let ESCAPES = {'n':'\n', 'f':'\f', 'r':'\r', 't':'\t', 
                'v': '\v', '\'': '\'', '"': '"'};

class Lexer {
    constructor(text) {
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
            } else if (this.is('[],{}:.()=')) {
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
            'false': {type: AST.Literal, value: false},
            'this' : {type: AST.ThisExpression},
            '$locals': {type: AST.LocalsExpression}
        }
    }

    ast(text) {
        this.tokens = this.lexer.lex(text);
        return this.program();
    }

    program() {
        return {type: AST.Program, body: this.assignment()};
    }

    primary() {
        let primary;
        if (this.expect('[')){
            primary = this.arrayDeclaration();
        } else if (this.expect('{')) {
            primary =  this.object();
        } else if (this.constants.hasOwnProperty(this.tokens[0].text)) {
            primary = this.constants[this.consume().text];
        }
        else if (this.peek().identifier) {
            primary = this.identifier();
        }
        else {
            primary = this.constant();
        }

        let next;
        while ((next = this.expect('.', '[', '('))) {
            if (next.text === '[') {
                primary = {
                    type: AST.MemberExpression,
                    object: primary,
                    property: this.assignment(),
                    computed: true
                };
                this.consume(']');
            } else if (next.text === '.') {
                primary = {
                    type: AST.MemberExpression,
                    object: primary,
                    property: this.identifier(),
                    computed: false
                };
            } else if (next.text === '(') {
                primary = {
                    type: AST.CallExpression, 
                    callee: primary,
                    arguments: this.parseArguments()
                };
                this.consume(')');
            }
        }

        return primary;
    }

    constant() {
        return {type: AST.Literal, value: this.consume().value};
    }

    expect(e1, e2, e3, e4) {
        let token = this.peek(e1, e2, e3, e4);
        if (token) {
            return this.tokens.shift();
        }
    }

    peek(e1, e2, e3, e4) {
        if (this.tokens.length > 0) {
            let text = this.tokens[0].text;
            if (text === e1 || text === e2 || text === e3 || text === e4 || 
                (!e1 && !e2 && !e3 && !e4)) {
                return this.tokens[0];
            }
        }
    }

    arrayDeclaration() {
        let elements = [];
        if (!this.peek(']')) {
            do {
                if (this.peek(']')) {
                    break;
                }
                elements.push(this.assignment());
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
                property.value = this.assignment();
                properties.push(property);
            } while (this.expect(','));
        }
        this.consume('}');
        return {type: AST.ObjectExpression, properties: properties};
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

    parseArguments() {
        let args = [];
        if (!this.peek(')')) {
            do {
                args.push(this.assignment());
            } while (this.expect(','));
        }
        return args;
    }

    assignment() {
        let left = this.primary();
        if (this.expect('=')) {
            let right = this.primary();
            return {type: AST.AssignmentExpression, left: left, right: right};
        }
        return left;
    }
}

// possibly move to staic get() in AST class
AST.Program = 'Program';
AST.Literal = 'Literal';
AST.ArrayExpression = 'ArrayExpression';
AST.ObjectExpression = 'ObjectExpression';
AST.Property = 'Property';
AST.Identifier = 'Identifier';
AST.ThisExpression = 'ThisExpression';
AST.MemberExpression = 'MemberExpression';
AST.LocalsExpression = 'LocalsExpression';
AST.CallExpression = 'CallExpression';
AST.AssignmentExpression = 'AssignmentExpression';

class ASTCompiler {
    constructor(astBuilder) {
        this.astBuilder = astBuilder;
        this.stringEscapeRegex = /[^a-zA-Z0-9]/g;
    }

    compile(text) {
        let ast = this.astBuilder.ast(text);
        this.state = {body: [], nextId: 0, vars:[]};
        this.recurse(ast);
        let fnString = 'var fn=function(s,l){' + 
                        (this.state.vars.length ?
                            'var ' + this.state.vars.join(',') + ';' :
                            ''
                        ) +
                        this.state.body.join('') +
                        '}; return fn;';
        return new Function('ensureSafeMemberName', 'ensureSafeObject', 'ensureSafeFunction', fnString)(this.ensureSafeMemberName, this.ensureSafeObject, this.ensureSafeFunction);
    }

    recurse(ast, context, create) {
        let intoId;
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
            case AST.Identifier:
                this.ensureSafeMemberName(ast.name);
                intoId = this.nextId();
                this.if_(this.getHasOwnProperty('l', ast.name), 
                    this.assign(intoId, this.nonComputedMember('l', ast.name)));
                if (create) {
                    this.if_(this.not(this.getHasOwnProperty('l', ast.name)) +
                                '&& s &&' +
                                this.not(this.getHasOwnProperty('s', ast.name)),
                            this.assign(this.nonComputedMember('s', ast.name), '{}'));
                }
                this.if_(this.not(this.getHasOwnProperty('l', ast.name)) + ' && s',
                    this.assign(intoId, this.nonComputedMember('s', ast.name)));
                if (context) {
                    context.context = this.getHasOwnProperty('l', ast.name) + '? l:s';
                    context.name = ast.name;
                    context.computed = false;
                }
                this.addEnsureSafeObject(intoId);
                return intoId;
            case AST.ThisExpression:
                return 's';
            case AST.MemberExpression:
                intoId = this.nextId();
                let left = this.recurse(ast.object, undefined, create);
                if (context) {
                    context.context = left;
                }
                if (ast.computed) {
                    let right = this.recurse(ast.property);
                    this.addEnsureSafeMemberName(right);
                    if (create) {
                        this.if_(this.not(this.computedMember(left, right)),
                            this.assign(this.computedMember(left, right), '{}'));
                    }
                    this.if_(left,
                        this.assign(intoId, 
                            'ensureSafeObject(' + this.computedMember(left, right) + ')'));
                    if (context) {
                        context.name = right;
                        context.computed = true;
                    }
                } else {
                    this.ensureSafeMemberName(ast.property.name);
                    if (create) {
                        this.if_(this.not(this.nonComputedMember(left, ast.property.name)),
                            this.assign(this.nonComputedMember(left, ast.property.name), '{}'));
                    }
                    this.if_(left,
                        this.assign(intoId, 
                            'ensureSafeObject(' + this.nonComputedMember(left, ast.property.name) + ')'));
                    if (context) {
                        context.name = ast.property.name;
                        context.computed = false;
                    }
                }
                return intoId;
            case AST.LocalsExpression:
                return 'l';
            case AST.CallExpression:
                let callContext = {};
                let callee = this.recurse(ast.callee, callContext);
                let args = _.map(ast.arguments, (arg) => {
                    return 'ensureSafeObject(' + this.recurse(arg) + ')';
                });
                if (callContext.name) {
                    this.addEnsureSafeObject(callContext.context);
                    if (callContext.computed) {
                        callee = this.computedMember(callContext.context, callContext.name);
                    } else {
                        callee = this.nonComputedMember(callContext.context, callContext.name);
                    }
                }
                this.addEnsureSafeFunction(callee);
                return `${callee}&&ensureSafeObject(${callee}(${args.join(',')}))`;
            case AST.AssignmentExpression:
                let leftContext = {};
                this.recurse(ast.left, leftContext, true);
                let leftExpr;
                if (leftContext.computed) {
                    leftExpr = this.computedMember(leftContext.context, leftContext.name);
                } else {
                    leftExpr = this.nonComputedMember(leftContext.context, leftContext.name);
                }
                return this.assign(leftExpr, 
                    `ensureSafeObject(${this.recurse(ast.right)})`);
        }
    }

    escape(value) {
        if (_.isString(value)) {
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

    nonComputedMember(left, right) {
        return `(${left}).${right}`;
    }

    computedMember(left, right) {
        return `(${left})[${right}]`;
    }

    if_(test, consequent) {
        this.state.body.push(`if(${test}){${consequent}}`);
    }

    not(e) {
        return `!(${e})`;
    }

    getHasOwnProperty(object, property) {
        return `${object} && (${this.escape(property)} in ${object})`;
    }

    assign(id, value) {
        return id + '=' + value + ';';
    }

    nextId() {
        let id = 'v' + (this.state.nextId++);
        this.state.vars.push(id);
        return id;
    }

    ensureSafeMemberName(name) {
        if (name === 'constructor' || name === '__proto__' || 
            name === '__defineGetter__' || name === '__defineSetter__' ||
            name === '__lookupGetter__' || name === '__lookupSetter__') {
            throw 'Attempting to access a disallowed field in Angular expressions!';
         }
    }

    addEnsureSafeMemberName(expr) {
        this.state.body.push('ensureSafeMemberName('+expr+');');
    }

    ensureSafeObject(obj) {
        if (obj) {
            if(obj.window === obj) {
                throw 'Referencing window in Angular expressions is disallowed!';
            } else if (obj.children &&
                (obj.nodeName || (obj.prop && obj.attr && obj.find))){
                throw 'Referencing DOM nodes in Angular expressions is disallowed!';
            } else if (obj.constructor === obj) {
                throw 'Referencing Function in Angular expressions is disallowed!';
            } else if (obj === Object) {
                throw 'Referencing Object in Angular expressions is disallowed!';
            }
            
        }
        return obj;
    }

    addEnsureSafeObject(expr) {
        this.state.body.push('ensureSafeObject('+expr+');');
    }

    ensureSafeFunction(obj) {
        if (obj) {
            if (obj.constructor === obj) {
                throw 'Referencing Function in Angular expressions is disallowed!';
            } else if (obj === Function.prototype.call || obj === Function.prototype.apply || obj === Function.prototype.bind) {
                throw 'Referencing call, apply or bind in Angular is disallowed!';
            }
        }
        return obj;
    }

    addEnsureSafeFunction(expr) {
        this.state.body.push('ensureSafeFunction('+expr+');');
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