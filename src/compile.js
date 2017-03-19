import _ from 'lodash';
import $ from 'jquery';

let PREFIX_REGEXP = /(x[\:\-_]|data[\:\-_])/i;
let BOOLEAN_ATTRS = {
    multiple: true,
    selected: true,
    checked: true,
    disabled: true,
    readOnly: true,
    required: true,
    open: true
};
let BOOLEAN_ELEMENTS = {
    INPUT: true,
    SELECT: true,
    OPTION: true,
    TEXTAREA: true,
    BUTTON: true,
    FORM: true,
    DETAILS: true
};

function directiveNormalize(name) {
    return _.camelCase(name.replace(PREFIX_REGEXP, ''));
}

function nodeName(element) {
    return element.nodeName ? element.nodeName : element[0].nodeName;
}

function byPriority(a, b) {
    let diff = b.priority - a.priority;
    if (diff !== 0) {
        return diff;
    } else {
        if (a.name !== b.name) {
            return (a.name < b.name ? -1 : 1);
        } else {
            return a.index - b.index;
        }     
    }
}

function parseIsolateBindings(scope) {
    let bindings = {};
    _.forEach(scope, (definition, scopeName) => {
        let match = definition.match(/\s*([@<&]|=(\*?))(\??)\s*(\w*)\s*/);
        bindings[scopeName] = {
            mode: match[1][0],
            collection: match[2] === '*',
            optional: match[3],
            attrName: match[4] || scopeName
        };
    });
    return bindings;
}

export default function $CompileProvider($provide) {
    let hasDirectives = {};
    this.directive = function(name, directiveFactory) {
        if (_.isString(name)) {
            if (name === 'hasOwnProperty') {
                throw 'hasOwnProperty is not a valid directive name';
            }
            if (!hasDirectives.hasOwnProperty(name)) {
                hasDirectives[name] = [];
                $provide.factory(name + 'Directive', ['$injector', ($injector) => {
                    let factories = hasDirectives[name];
                    return _.map(factories, (factory, i) => {
                        let directive = $injector.invoke(factory);
                        directive.restrict = directive.restrict || 'EA';
                        directive.name = directive.name || name;
                        directive.index = i;
                        directive.priority = directive.priority || 0;
                        if (directive.link && !directive.compile) {
                            directive.compile = _.constant(directive.link);
                        }
                        if (_.isObject(directive.scope)) {
                            directive.$$isolateBindings = parseIsolateBindings(directive.scope);
                        }
                        return directive;
                    });
                }]);
            }
            hasDirectives[name].push(directiveFactory);
        } else {
            _.forEach(name, (directiveFactory, name) => {
                this.directive(name, directiveFactory);
            });
        }
        
    };
    
    this.$get = ['$injector', '$rootScope', '$parse', function($injector, $rootScope, $parse) {

        class Attribtues {
            constructor(element) {
                this.$$element = element;
                this.$attr = {};
            }

            $set(key, value, writeAttr, attrName) {
                this[key] = value;
                if (isBooleanAttribute(this.$$element[0], key)) {
                    this.$$element.prop(key, value);
                }

                if (!attrName) {
                    if (this.$attr[key]) {
                        attrName = this.$attr[key];
                    } else {
                        attrName = this.$attr[key] = _.kebabCase(key, '-');
                    }
                } else {
                    this.$attr[key] = attrName;
                }

                if (writeAttr !== false) {
                    this.$$element.attr(attrName, value);
                }

                if (this.$$observers) {
                    _.forEach(this.$$observers[key], (observer) => {
                        try {
                            observer(value);
                        } catch (e) {
                            console.log(e);
                        }
                    });
                }
            }

            $observe(key, fn) {
                this.$$observers = this.$$observers || Object.create(null);
                this.$$observers[key] = this.$$observers[key] || [];
                this.$$observers[key].push(fn);
                $rootScope.$evalAsync(() => {
                    fn(this[key]);
                });
                return () => {
                    let index = this.$$observers[key].indexOf(fn);
                    if (index >= 0) {
                        this.$$observers[key].splice(index, 1);
                    }
                }
            }

            $addClass(classVal) {
                this.$$element.addClass(classVal);
            }

            $removeClass(classVal) {
                this.$$element.removeClass(classVal);
            }

            $updateClass(newClassVal, oldClassVal) {
                let newClasses = newClassVal.split(/\s+/);
                let oldClasses = oldClassVal.split(/\s+/);
                let addedClasses = _.difference(newClasses, oldClasses);
                let removedClasses = _.difference(oldClasses, newClasses);
                if (addedClasses.length) {
                    this.$addClass(addedClasses.join(' '));
                }
                if (removedClasses.length) {
                    this.$removeClass(removedClasses.join(' '));
                }
            }
        }

        function compile($compileNodes) {
            let compositeLinkFn = compileNodes($compileNodes);
            return function publicLinkFn(scope) {
                $compileNodes.data('$scope', scope);
                compositeLinkFn(scope, $compileNodes);
            };
        }

        function compileNodes($compileNodes) {
            let linkFns = [];
            _.forEach($compileNodes, (node, i) => {
                let attrs = new Attribtues($(node));
                let directives = collectDirectives(node, attrs);
                let nodeLinkFn;
                if (directives.length) {
                    nodeLinkFn = applyDirectivesToNode(directives, node, attrs);
                }
                let childLinkFn;
                if ((!nodeLinkFn || !nodeLinkFn.terminal) &&
                    node.childNodes && node.childNodes.length) {
                    childLinkFn = compileNodes(node.childNodes);
                }
                if (nodeLinkFn && nodeLinkFn.scope) {
                    attrs.$$element.addClass('ng-scope');
                }
                if (nodeLinkFn || childLinkFn) {
                    linkFns.push({
                        nodeLinkFn: nodeLinkFn,
                        childLinkFn: childLinkFn,
                        idx: i
                    });
                }
            });

            function compositeLinkFn(scope, linkNodes) {
                let stableNodeList = [];
                _.forEach(linkFns, (linkFn) => {
                    let nodeIdx = linkFn.idx;
                    stableNodeList[nodeIdx] = linkNodes[nodeIdx];
                });
                _.forEach(linkFns, (linkFn) => {
                    let node = stableNodeList[linkFn.idx];
                    if (linkFn.nodeLinkFn) {
                        if (linkFn.nodeLinkFn.scope) {
                            scope = scope.$new();
                            $(node).data('$scope', scope);
                        }
                        linkFn.nodeLinkFn(
                            linkFn.childLinkFn,
                            scope, 
                            node
                        );
                    } else {
                        linkFn.childLinkFn(
                            scope,
                            node.childNodes
                        );
                    }
                });
            }

            return compositeLinkFn;
        }

        function applyDirectivesToNode(directives, compileNode, attrs) {
            let $compileNode = $(compileNode);
            let terminalPriority = -Number.MAX_VALUE;
            let terminal = false;
            let preLinkFns = [], postLinkFns = [];
            let newScopeDirective, newIsolateScopeDirective;

            function addLinkFns(preLinkFn, postLinkFn, attrStart, attrEnd, isolateScope) {
                if (preLinkFn) {
                    if (attrStart) {
                        preLinkFn = groupElementsLinkFnWrapper(preLinkFn, attrStart, attrEnd);
                    }
                    preLinkFn.isolateScope = isolateScope;
                    preLinkFns.push(preLinkFn);
                }
                if (postLinkFn) {
                    if (attrStart) {
                        postLinkFn = groupElementsLinkFnWrapper(postLinkFn, attrStart, attrEnd);
                    }
                    postLinkFn.isolateScope = isolateScope;
                    postLinkFns.push(postLinkFn);
                }
            }

            _.forEach(directives, (directive) => {
                if (directive.$$start) {
                    $compileNode = groupScan(compileNode, directive.$$start, directive.$$end);
                }
                if (directive.priority < terminalPriority) {
                    return false; //early exit of _.forEach
                }
                if (directive.scope) {
                    if (_.isObject(directive.scope)) {
                        if (newIsolateScopeDirective || newScopeDirective) {
                            throw 'Multiple directives asking for new/inherited scope';
                        }
                        newIsolateScopeDirective = directive;
                    } else {
                        if (newIsolateScopeDirective) {
                            throw 'Multiple directives asking for new/inherited scope';
                        }
                        newScopeDirective = newScopeDirective || directive;
                    } 
                }
                if (directive.compile) {
                    let linkFn = directive.compile($compileNode, attrs);
                    let isolateScope = (directive === newIsolateScopeDirective);
                    let attrStart = directive.$$start;
                    let attrEnd = directive.$$end;
                    if (_.isFunction(linkFn)) {
                        addLinkFns(null, linkFn, attrStart, attrEnd, isolateScope);
                    } else if (linkFn) {
                        addLinkFns(linkFn.pre, linkFn.post, attrStart, attrEnd, isolateScope);
                    }
                }
                if (directive.terminal) {
                    terminal = true;
                    terminalPriority = directive.priority;
                }
            });

            function nodeLinkFn(childLinkFn, scope, linkNode) {
                let $element = $(linkNode);
                let isolateScope;
                if (newIsolateScopeDirective) {
                    isolateScope = scope.$new(true);
                    $element.addClass('ng-isolate-scope');
                    $element.data('$isolateScope', isolateScope);
                    _.forEach(
                        newIsolateScopeDirective.$$isolateBindings,
                        (definition, scopeName) => {
                            let attrName = definition.attrName;
                            let parentGet, unwatch;
                            switch(definition.mode) {
                                case '@':
                                    attrs.$observe(attrName, (newAttrValue) => {
                                        isolateScope[scopeName] = newAttrValue;
                                    });
                                    if (attrs[attrName]) {
                                        isolateScope[scopeName] = attrs[attrName];
                                    }
                                    break;
                                case '<':
                                    if (definition.optional && !attrs[attrName]) {
                                        break;
                                    }
                                    parentGet = $parse(attrs[attrName]);
                                    isolateScope[scopeName] = parentGet(scope); //scope is parent scope
                                    unwatch = scope.$watch(parentGet, (newValue) => {
                                        isolateScope[scopeName] = newValue;
                                    });
                                    isolateScope.$on('$destroy', unwatch);
                                    break;
                                case '=':
                                    if (definition.optional && !attrs[attrName]) {
                                        break;
                                    }
                                    parentGet = $parse(attrs[attrName]);
                                    let lastValue = isolateScope[scopeName] = parentGet(scope);
                                    let parentValueWatch = () => {
                                        let parentValue = parentGet(scope);
                                        if (isolateScope[scopeName] !== parentValue) {
                                            if (parentValue !== lastValue) {
                                                isolateScope[scopeName] = parentValue;
                                            } else {
                                                parentValue = isolateScope[scopeName];
                                                parentGet.assign(scope, parentValue);
                                            }
                                        }
                                        lastValue = parentValue;
                                        return parentValue;
                                    };
                                    if (definition.collection) {
                                        unwatch = scope.$watchCollection(attrs[attrName], parentValueWatch);
                                    } else {
                                        unwatch = scope.$watch(parentValueWatch);
                                    }
                                    isolateScope.$on('$destroy', unwatch);
                                    break;
                                case '&':
                                    let parentExpr = $parse(attrs[attrName]);
                                    if (parentExpr === _.noop && definition.optional) {
                                        break;
                                    }
                                    isolateScope[scopeName] = (locals) => {
                                        return parentExpr(scope, locals);
                                    };
                                    break;
                            }
                        }
                    );
                }
                _.forEach(preLinkFns, (linkFn) => {
                    linkFn(linkFn.isolateScope ? isolateScope : scope, $element, attrs);
                });
                if (childLinkFn) {
                    childLinkFn(scope, linkNode.childNodes);
                }
                _.forEachRight(postLinkFns, (linkFn) => {
                    linkFn(linkFn.isolateScope ? isolateScope : scope, $element, attrs);
                });
            }
            nodeLinkFn.terminal = terminal;
            nodeLinkFn.scope = newScopeDirective && newScopeDirective.scope;
            return nodeLinkFn;
        }

        function collectDirectives(node, attrs) {
            let directives = [];
            let match;
            if (node.nodeType === Node.ELEMENT_NODE) {
                let normalizedNodeName = directiveNormalize(nodeName(node).toLowerCase());
                addDirective(directives, normalizedNodeName, 'E');
                _.forEach(node.attributes, (attr) => {
                    let attrStartName, attrEndName;
                    let name = attr.name;
                    let normalizedAttrName = directiveNormalize(name.toLowerCase());
                    let isNgAttr = /^ngAttr[A-Z]/.test(normalizedAttrName);
                    if (isNgAttr) {
                        name = _.kebabCase(
                            normalizedAttrName[6].toLowerCase() +
                            normalizedAttrName.substring(7)            
                        );
                        normalizedAttrName = directiveNormalize(name.toLowerCase());   
                    }
                    attrs.$attr[normalizedAttrName] = name;
                    let directiveName = normalizedAttrName.replace(/(Start|End)$/, '');
                    if (directiveIsMultiElement(directiveName)) {
                        if (/Start$/.test(normalizedAttrName)) {
                            attrStartName = name;
                            attrEndName = name.substring(0, name.length - 5) + 'end';
                            name = name.substring(0, name.length - 6);
                        }
                    }
                    normalizedAttrName = directiveNormalize(name.toLowerCase());
                    addDirective(directives, normalizedAttrName, 'A', 
                        attrStartName, attrEndName);
                    if (isNgAttr || !attrs.hasOwnProperty(normalizedAttrName)) {
                        attrs[normalizedAttrName] = attr.value.trim();
                        if (isBooleanAttribute(node, normalizedAttrName)) {
                            attrs[normalizedAttrName] = true;
                        }
                    }
                });

                let className = node.className;
                if (_.isString(className) && !_.isEmpty(className)) {
                    while ((match = /([\d\w\-_]+)(?:\:([^;]+))?;?/.exec(className))) {
                        let normalizedClassName = directiveNormalize(match[1]);
                        if (addDirective(directives, normalizedClassName, 'C')) {
                            attrs[normalizedClassName] = match[2] ? match[2].trim() : undefined;
                        }
                        className = className.substr(match.index + match[0].length);
                    }
                }
            } else if (node.nodeType === Node.COMMENT_NODE) {
                match = /^\s*directive\:\s*([\d\w\-_]+)\s*(.*)$/.exec(node.nodeValue);
                if (match) {
                    let normalizedName = directiveNormalize(match[1]);
                    if (addDirective(directives, directiveNormalize(match[1]), 'M')) {
                        attrs[normalizedName] = match[2] ? match[2].trim() : undefined;
                    }
                    
                }
            }
            directives.sort(byPriority);
            return directives;
        }

        function addDirective(directives, name, mode, attrStartName, attrEndName) {
            let match;
            if (hasDirectives.hasOwnProperty(name)) {
                let foundDirectives = $injector.get(name + 'Directive');
                let applicableDirectives = _.filter(foundDirectives, (dir) => {
                    return dir.restrict.indexOf(mode) !== -1;
                });
                _.forEach(applicableDirectives, (directive) => {
                    if (attrStartName) {
                        directive = _.create(directive, {
                            $$start: attrStartName,
                            $$end: attrEndName
                        });
                    }
                    directives.push(directive);
                    match = directive;
                });
            }
            return match;
        }

        function directiveIsMultiElement(name) {
            if (hasDirectives.hasOwnProperty(name)) {
                let directive = $injector.get(name + 'Directive');
                return _.some(directive, {multiElement: true});
            }
            return false;
        }

        function groupScan(node, startAttr, endAttr) {
            let nodes = [];
            if (startAttr && node && node.hasAttribute(startAttr)) {
                let depth = 0;
                do {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.hasAttribute(startAttr)) {
                            depth++;
                        } else if (node.hasAttribute(endAttr)) {
                            depth--;
                        }
                    }
                    nodes.push(node);
                    node = node.nextSibling;
                } while (depth > 0);
            } else {
                nodes.push(node);
            }
            return $(nodes);
        }

        function groupElementsLinkFnWrapper(linkFn, attrStart, attrEnd) {
            return function(scope, element, attrs) {
                let group = groupScan(element[0], attrStart, attrEnd);
                return linkFn(scope, group, attrs);
            };
        }

        function isBooleanAttribute(node, attrName) {
            return BOOLEAN_ATTRS[attrName] && BOOLEAN_ELEMENTS[node.nodeName];
        }

        return compile;
    }];

    $CompileProvider.$inject = ['$provide'];
}