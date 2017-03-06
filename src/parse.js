import _ from 'lodash';

import {filter} from 'filter';

let ESCAPES = {'n':'\n', 'f':'\f', 'r':'\r', 't':'\t', 
                'v': '\v', '\'': '\'', '"': '"'};

let OPERATORS = {
    '+': true,
    '!': true,
    '-': true,
    '*': true,
    '/': true,
    '%': true,
    '=': true,
    '==': true,
    '!=': true,
    '===': true,
    '!==': true,
    '<': true,
    '>': true,
    '<=': true,
    '>=': true,
    '&&': true,
    '||': true,
    '|': true
    };

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
            } else if (this.is('[],{}:.()?;')) {
                this.tokens.push({
                    text: this.ch
                });
                this.index++;
            } else if (this.isIdent(this.ch)) {
                this.readIdent();
            } else if (this.isWhitespace(this.ch)) {
                this.index++;
            } else {
                let ch = this.ch;
                let ch2 = this.ch + this.peek();
                let ch3 = ch2 + this.peek(2);
                let op = OPERATORS[ch];
                let op2 = OPERATORS[ch2];
                let op3 = OPERATORS[ch3];
                if (op || op2 || op3) {
                    let token = op3 ? ch3 : (op2 ? ch2 : ch);
                    this.tokens.push({text: token});
                    this.index += token.length;
                } else {
                    throw `Unexpected next character: ${this.ch}`;
                }
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
        let rawString = quote;
        while (this.index < this.text.length) {
            let ch = this.text.charAt(this.index);
            rawString += ch;
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
                    text: rawString,
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

    peek(n) {
        n = n || 1;
        return this.index + n < this.text.length ?
            this.text.charAt(this.index + n) :
            false;
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
        let body = [];
        while (true) {
            if (this.tokens.length) {
                body.push(this.filter());
            }
            if (!this.expect(';')) {
                return {type: AST.Program, body: body};
            }
        }  
    }

    primary() {
        let primary;
        if (this.expect('(')) {
            primary = this.filter();
            this.consume(')');
        } else if (this.expect('[')){
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
        let left = this.ternary();
        if (this.expect('=')) {
            let right = this.ternary();
            return {type: AST.AssignmentExpression, left: left, right: right};
        }
        return left;
    }

    unary() {
        let token;
        if ((token = this.expect('+', '!', '-'))) {
            return {
                type: AST.UnaryExpression,
                operator: token.text,
                argument: this.unary()
            };
        } else {
            return this.primary();
        }
    }

    multiplicative() {
        let left = this.unary();
        let token;
        while ((token = this.expect('*', '/', '%'))) {
            left = {
                type: AST.BinaryExpression,
                left: left,
                operator: token.text,
                right: this.unary()
            };
        }
        return left;
    }

    additive() {
        let left = this.multiplicative();
        let token;
        while ((token = this.expect('+') || (token = this.expect('-')))) {
            left = {
                type: AST.BinaryExpression,
                left: left,
                operator: token.text,
                right: this.multiplicative()
            };
        }
        return left;
    }

    equality() {
        let left = this.relational();
        let token;
        while ((token = this.expect('==', '!=', '===', '!=='))) {
            left = {
                type: AST.BinaryExpression,
                left: left,
                operator: token.text,
                right: this.relational()
            };
        }
        return left;
    }

    relational() {
        let left = this.additive();
        let token;
        while ((token = this.expect('<', '>', '<=', '>='))) {
            left = {
                type: AST.BinaryExpression,
                left: left,
                operator: token.text,
                right: this.additive()
            };
        }
        return left;
    }

    logicalOR() {
        let left = this.logicalAND();
        let token;
        while ((token = this.expect('||'))) {
            left = {
                type: AST.LogicalExpression,
                left: left,
                operator: token.text,
                right: this.logicalAND()
            };
        }
        return left;
    }

    logicalAND() {
        let left = this.equality();
        let token;
        while ((token = this.expect('&&'))) {
            left = {
                type: AST.LogicalExpression,
                left: left,
                operator: token.text,
                right: this.equality()
            };
        }
        return left;
    }

    ternary() {
        let test = this.logicalOR();
        if (this.expect('?')) {
            let consequent = this.assignment();
            if (this.consume(':')) {
                let alternate = this.assignment();
                return {
                    type: AST.ConditionalExpression,
                    test: test,
                    consequent: consequent,
                    alternate: alternate
                };
            }
        }
        return test;
    }

    filter() {
        let left = this.assignment();
        while (this.expect('|')) {
            let args = [left];
            left = {
                type: AST.CallExpression,
                callee: this.identifier(),
                arguments: args,
                filter: true
            }
            while (this.expect(':')) {
                args.push(this.assignment());
            }
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
AST.UnaryExpression = 'UnaryExpression';
AST.BinaryExpression = 'BinaryExpression';
AST.LogicalExpression = 'LogicalExpression';
AST.ConditionalExpression = 'ConditionalExpression';
AST.NGValueParameter = "NGValueParameter";

class ASTCompiler {
    constructor(astBuilder) {
        this.astBuilder = astBuilder;
        this.stringEscapeRegex = /[^a-zA-Z0-9]/g;
    }

    compile(text) {
        let ast = this.astBuilder.ast(text);
        let extra = '';
        this.markConstantAndWatchExpressions(ast);
        this.state = {
                nextId: 0, 
                fn: {body:[], vars:[]}, 
                filters: {},
                assign: {body: [], vars: []},
                inputs: []
            };
        this.stage = 'inputs';
        _.forEach(this.getInputs(ast.body), (input, idx) => {
            let inputKey = 'fn' + idx;
            this.state[inputKey] = {body: [], vars: []};
            this.state.computing = inputKey;
            this.state[inputKey].body.push('return ' + this.recurse(input) + ';');
            this.state.inputs.push(inputKey);
        });
        this.stage = 'assign';
        let assignable = this.assignableAST(ast);
        if (assignable) {
            this.state.computing = 'assign';
            this.state.assign.body.push(this.recurse(assignable));
            extra = 'fn.assign = function(s,v,l){' +
                (this.state.assign.vars.length ?
                    'var ' + this.state.assign.vars.join(',') + ';' :
                    ''
                ) + 
                this.state.assign.body.join('') +
                '};';
        }
        this.stage = 'main';
        this.state.computing = 'fn';
        this.recurse(ast);
        let fnString = this.filterPrefix() +
                        'var fn=function(s,l){' + 
                        (this.state.fn.vars.length ?
                            'var ' + this.state.fn.vars.join(',') + ';' :
                            ''
                        ) +
                        this.state.fn.body.join('') +
                        '};' +
                        this.watchFns() +
                        extra +
                        ' return fn;';
        let fn = new Function('ensureSafeMemberName', 
                            'ensureSafeObject', 
                            'ensureSafeFunction', 
                            'ifDefined',
                            'filter',
                            fnString)(this.ensureSafeMemberName, 
                                      this.ensureSafeObject, 
                                      this.ensureSafeFunction,
                                      this.ifDefined,
                                      filter);
        fn.literal = this.isLiteral(ast);
        fn.constant = ast.constant;
        return fn;
    }

    recurse(ast, context, create) {
        let intoId;
        switch (ast.type) {
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
                let localsCheck;
                if (this.stage === 'inputs') {
                    localsCheck = 'false';
                } else {
                    localsCheck = this.getHasOwnProperty('l', ast.name);
                }
                this.if_(localsCheck, 
                    this.assign(intoId, this.nonComputedMember('l', ast.name)));
                if (create) {
                    this.if_(this.not(localsCheck) +
                                '&& s &&' +
                                this.not(this.getHasOwnProperty('s', ast.name)),
                            this.assign(this.nonComputedMember('s', ast.name), '{}'));
                }
                this.if_(this.not(localsCheck) + ' && s',
                    this.assign(intoId, this.nonComputedMember('s', ast.name)));
                if (context) {
                    context.context = localsCheck + '? l:s';
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
                let callContext, callee, args;
                if (ast.filter) {
                    callee = this.filter(ast.callee.name);
                    args = _.map(ast.arguments, (arg) => {
                        return this.recurse(arg);
                    });
                    return callee + '(' + args + ')';
                } else {
                    callContext = {};
                    callee = this.recurse(ast.callee, callContext);
                    args = _.map(ast.arguments, (arg) => {
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
                }
                break;
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
            case AST.UnaryExpression:
                return ast.operator + '(' + this._ifDefined(this.recurse(ast.argument), 0) + ')';
            case AST.BinaryExpression:
                if (ast.operator === '+' || ast.operator === '-') {
                    return '(' + this._ifDefined(this.recurse(ast.left), 0) + ')' +
                        ast.operator +
                        '(' + this._ifDefined(this.recurse(ast.right), 0) + ')';
                } else {
                    return '(' + this.recurse(ast.left) + ')' +
                        ast.operator + 
                        '(' + this.recurse(ast.right) + ')';
                }  
                break;
            case AST.LogicalExpression: 
                intoId = this.nextId();
                this.state[this.state.computing].body.push(this.assign(intoId, this.recurse(ast.left)));
                this.if_((ast.operator === '&&' ? intoId: this.not(intoId)),
                    this.assign(intoId, this.recurse(ast.right)));
                return intoId;
            case AST.ConditionalExpression:
                intoId = this.nextId();
                let testId = this.nextId();
                this.state[this.state.computing].body.push(this.assign(testId, this.recurse(ast.test)));
                this.if_(testId,
                    this.assign(intoId, this.recurse(ast.consequent)));
                this.if_(this.not(testId),
                    this.assign(intoId, this.recurse(ast.alternate)));
                return intoId;
            case AST.Program:
                _.forEach(_.initial(ast.body), (stmt) => {
                    this.state[this.state.computing].body.push(this.recurse(stmt), ';');
                });
                this.state[this.state.computing].body.push('return ', this.recurse(_.last(ast.body)), ';');
                break;
            case AST.NGValueParameter:
                return 'v';
        }
    }

    _ifDefined(value, defaultValue) {
        return 'ifDefined(' + value + ',' + this.escape(defaultValue) + ')';
    }

    ifDefined(value, defaultValue) {
        return typeof value === 'undefined' ? defaultValue : value;
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
        this.state[this.state.computing].body.push(`if(${test}){${consequent}}`);
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

    nextId(skip) {
        let id = 'v' + (this.state.nextId++);
        if (!skip) {
            this.state[this.state.computing].vars.push(id);
        }
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
        this.state[this.state.computing].body.push('ensureSafeMemberName('+expr+');');
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
        this.state[this.state.computing].body.push('ensureSafeObject('+expr+');');
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
        this.state[this.state.computing].body.push('ensureSafeFunction('+expr+');');
    }

    filter(name) {
        if (!this.state.filters.hasOwnProperty(name)) {
            this.state.filters[name] = this.nextId(true);
        }
        return this.state.filters[name];
    }

    filterPrefix() {
        if (_.isEmpty(this.state.filters)) {
            return '';
        } else {
            let parts = _.map(this.state.filters, (varName, filterName) => {
                return varName + '=' + 'filter(' + this.escape(filterName) + ')';
            });
            return 'var ' + parts.join(',') + ';';
        }
    }

    isLiteral(ast) {
        return ast.body.length === 0 ||
            ast.body.length === 1 && (
                ast.body[0].type === AST.Literal ||
                ast.body[0].type === AST.ArrayExpression ||
                ast.body[0].type === AST.ObjectExpression
            );
    }

    markConstantAndWatchExpressions(ast) {
        let allConstants;
        let argsToWatch;
        switch (ast.type) {
            case AST.Program:
                allConstants = true;
                _.forEach(ast.body, (expr) => {
                    this.markConstantAndWatchExpressions(expr);
                    allConstants = allConstants && expr.constant;
                });
                ast.constant = allConstants;
                break;
            case AST.Literal:
                ast.constant = true;
                ast.toWatch = [];
                break;
            case AST.Identifier:
                ast.constant = false;
                ast.toWatch = [ast];
                break;
            case AST.ArrayExpression:
                allConstants = true;
                argsToWatch = [];
                _.forEach(ast.elements, (element) => {
                    this.markConstantAndWatchExpressions(element);
                    allConstants = allConstants && element.constant;
                    if (!element.constant) {
                        argsToWatch.push.apply(argsToWatch, element.toWatch);
                    }
                });
                ast.constant = allConstants;
                ast.toWatch = argsToWatch;
                break;
            case AST.ObjectExpression:
                allConstants = true;
                argsToWatch = [];
                _.forEach(ast.properties, (property) => {
                    this.markConstantAndWatchExpressions(property.value);
                    allConstants = allConstants && property.value.constant;
                    if (!property.value.constant) {
                        argsToWatch.push.apply(argsToWatch, property.value.toWatch);
                    }
                 });
                ast.constant = allConstants;
                ast.toWatch = argsToWatch;
                break;
            case AST.ThisExpression:
            case AST.LocalsExpression:
                ast.constant = false;
                ast.toWatch = [];
                break;
            case AST.MemberExpression:
                this.markConstantAndWatchExpressions(ast.object);
                if (ast.computed) {
                    this.markConstantAndWatchExpressions(ast.property);
                }
                ast.constant = ast.object.constant &&
                                (!ast.computed || ast.property.constant);
                ast.toWatch = [ast];
                break;
            case AST.CallExpression:
                let stateless = ast.filter && !filter(ast.callee.name).$stateful;
                allConstants = stateless ? true : false;
                argsToWatch = [];
                _.forEach(ast.arguments, (arg) => {
                    this.markConstantAndWatchExpressions(arg);
                    allConstants = allConstants && arg.constant;
                    if (!arg.constant) {
                        argsToWatch.push.apply(argsToWatch, arg.toWatch);
                    }
                });
                ast.constant = allConstants;
                ast.toWatch = stateless ? argsToWatch : [ast];
                break;
            case AST.AssignmentExpression: 
                this.markConstantAndWatchExpressions(ast.left);
                this.markConstantAndWatchExpressions(ast.right);
                ast.constant = ast.left.constant && ast.right.constant;
                ast.toWatch = [ast];
                break;
            case AST.UnaryExpression:
                this.markConstantAndWatchExpressions(ast.argument);
                ast.constant = ast.argument.constant;
                ast.toWatch = ast.argument.toWatch;
                break;
            case AST.BinaryExpression:
                this.markConstantAndWatchExpressions(ast.left);
                this.markConstantAndWatchExpressions(ast.right);
                ast.constant = ast.left.constant && ast.right.constant;
                ast.toWatch = ast.left.toWatch.concat(ast.right.toWatch);
                break;
            case AST.LogicalExpression:
                this.markConstantAndWatchExpressions(ast.left);
                this.markConstantAndWatchExpressions(ast.right);
                ast.constant = ast.left.constant && ast.right.constant;
                ast.toWatch = [ast]
                break;
            case AST.ConditionalExpression:
                this.markConstantAndWatchExpressions(ast.test);
                this.markConstantAndWatchExpressions(ast.consequent);
                this.markConstantAndWatchExpressions(ast.alternate);
                ast.constant = ast.test.constant && ast.consequent.constant && ast.alternate.constant;
                ast.toWatch = [ast];
                break;
        }
    }

    getInputs(ast) {
        if (ast.length !== 1) {
            return;
        }
        let candidate = ast[0].toWatch;
        if (candidate.length != 1 || candidate[0] !== ast[0]) {
            return candidate;
        }
    }

    watchFns() {
        let result = [];
        _.forEach(this.state.inputs, (inputName) => {
            result.push('var ', inputName, '=function(s) {', 
                (this.state[inputName].vars.length ? 
                    'var ' + this.state[inputName].vars.join(',') + ';' :
                    ''
                    ),
                    this.state[inputName].body.join(''),
                    '};');
        });
        if (result.length) {
            result.push('fn.inputs = [', this.state.inputs.join(','), '];');
        }
        return result.join('');
    }

    isAssignable(ast) {
        return ast.type === AST.Identifier || ast.type === AST.MemberExpression;
    }

    assignableAST(ast) {
        if (ast.body.length === 1 && this.isAssignable(ast.body[0])) {
            return {
                type: AST.AssignmentExpression,
                left: ast.body[0],
                right: {type: AST.NGValueParameter}
            }
        }
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
    switch (typeof expr) {
        case 'string': 
            let lexer = new Lexer();
            let parser = new Parser(lexer);
            let oneTime = false;
            if (expr.charAt(0) === ':' && expr.charAt(1) === ':') {
                oneTime = true;
                expr = expr.substring(2);
            }
            let parseFn = parser.parse(expr);
            if (parseFn.constant) {
                parseFn.$$watchDelegate = constantWatchDelegate;
            } else if (oneTime) {
                parseFn.$$watchDelegate = parseFn.literal ? oneTimeLiteralWatchDelegate : oneTimeWatchDelegate;
            } else if (parseFn.inputs) {
                parseFn.$$watchDelegate = inputsWatchDelegate;
            }
            return parseFn;
        case 'function':
            return expr;
        default:
            return _.noop;
    }
    let lexer = new Lexer();
    let parser = new Parser(lexer);  
    return parser.parse(expr); 
}

function constantWatchDelegate(scope, listenerFn, valueEq, watchFn) {
    let unwatch = scope.$watch(
        () => {
            return watchFn(scope);
        }, 
        (newValue, oldValue, scope) => {
            if (_.isFunction(listenerFn)) {
                listenerFn(newValue, oldValue, scope);
                unwatch();
            }
        },
        valueEq
    );
    return unwatch;
}

function oneTimeWatchDelegate(scope, listenerFn, valueEq, watchFn) {
    let lastValue;
    let unwatch = scope.$watch(
        () => {
            return watchFn(scope);
        }, 
        (newValue, oldValue, scope) => {
            lastValue = newValue;
            if (_.isFunction(listenerFn)) {
                listenerFn(newValue, oldValue, scope);
            }
            if (!_.isUndefined(newValue)) {
                scope.$$postDigest(()=>{
                    if (!_.isUndefined(lastValue)) {
                        unwatch();
                    }
                });
            }
        },
        valueEq
    );
    return unwatch;
}

function oneTimeLiteralWatchDelegate(scope, listenerFn, valueEq, watchFn) {
    let isAllDefined = function(val) {
        // BYOAJS uses _.any which I think couldn't find
        return !_.some(val, _.isUndefined);
    };
    let unwatch = scope.$watch(
        () => {
            return watchFn(scope);
        }, 
        (newValue, oldValue, scope) => {
            if (_.isFunction(listenerFn)) {
                listenerFn(newValue, oldValue, scope);
            }
            if (isAllDefined(newValue)) {
                scope.$$postDigest(() => {
                    if (isAllDefined(newValue)) {
                        unwatch();
                    }
                });
            }
        },
        valueEq
    );
    return unwatch;
}

function inputsWatchDelegate(scope, listenerFn, valueEq, watchFn) {
    let inputExpressions = watchFn.inputs;
    let oldValues = _.times(inputExpressions.length, _.constant(() => {}));
    let lastResult;

    return scope.$watch(
        () => {
            let changed = false;
            _.forEach(inputExpressions, (inputExpr, i) => {
                let newValue = inputExpr(scope);
                if (changed || !expressionInputDirtyCheck(newValue, oldValues[i])) {
                    changed = true;
                    oldValues[i] = newValue;
                }
            });
            if (changed) {
                lastResult = watchFn(scope);
            }
            return lastResult;
        }, listenerFn, valueEq
    );
}

function expressionInputDirtyCheck(newValue, oldValue) {
    return newValue === oldValue || 
        (typeof newValue === 'number' && typeof oldValue === 'number' &&
            _.isNaN(newValue) && _.isNaN(oldValue));
}

export default parse;