import _ from 'lodash';
import $ from 'jquery';

let PREFIX_REGEXP = /(x[\:\-_]|data[\:\-_])/i;
let REQUIRE_PREFIX_REGEXP = /^(\^\^?)?(\?)?(\^\^?)?/;
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

function parseDirectiveBindings(directive) {
    let bindings = {};
    if (_.isObject(directive.scope)) {
        if (directive.bindToController) {
            bindings.bindToController = parseIsolateBindings(directive.scope);
        } else {
            bindings.isolateScope = parseIsolateBindings(directive.scope);
        }
    }
    if (_.isObject(directive.bindToController)) {
        bindings.bindToController = parseIsolateBindings(directive.bindToController);
    }
    return bindings;
}

function getDirectiveRequire(directive, name) {
    let require = directive.require || (directive.controller && name);
    if (!_.isArray(require) && _.isObject(require)) {
        _.forEach(require, (value, key) => {
            let prefix = value.match(REQUIRE_PREFIX_REGEXP);
            let name = value.substring(prefix[0].length);
            if (!name) {
                require[key] = prefix[0] + key;
            }
        });
    }
    return require;
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
                        directive.$$bindings = parseDirectiveBindings(directive);
                        directive.require = getDirectiveRequire(directive, name);
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
    
    this.$get = ['$injector', '$rootScope', '$parse', '$controller', '$http', '$interpolate', function($injector, $rootScope, $parse, $controller, $http, $interpolate) {

        let startSymbol = $interpolate.startSymbol();
        let endSymbol = $interpolate.endSymbol();
        let denormalizeTemplate = (startSymbol === '{{' && endSymbol === '}}') ?
            _.identity :
            function(template) {
                return template.replace(/\{\{/g, startSymbol).replace(/\}\}/g, endSymbol);
            }

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
                    if (!this.$$observers[key].$$inter) {
                        fn(this[key]);
                    } 
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

        function compile($compileNodes, maxPriority) {
            let compositeLinkFn = compileNodes($compileNodes, maxPriority);
            return function publicLinkFn(scope, cloneAttachFn, options) {
                options = options || {};
                let parentBoundTranscludeFn = options.parentBoundTranscludeFn;
                let transcludeControllers = options.transcludeControllers;
                if (parentBoundTranscludeFn && parentBoundTranscludeFn.$$boundTransclude) {
                    parentBoundTranscludeFn = parentBoundTranscludeFn.$$boundTransclude;
                }
                let $linkNodes;
                if (cloneAttachFn) {
                    $linkNodes = $compileNodes.clone();
                    cloneAttachFn($linkNodes, scope);
                } else {
                    $linkNodes = $compileNodes;
                }
                _.forEach(transcludeControllers, (controller, name) => {
                    $linkNodes.data('$' + name + 'Controller', controller.instance);
                })
                $linkNodes.data('$scope', scope);
                compositeLinkFn(scope, $linkNodes, parentBoundTranscludeFn);
                return $linkNodes;
            };
        }

        function compileNodes($compileNodes, maxPriority) {
            let linkFns = [];
            _.times($compileNodes.length, (i) => {
                let attrs = new Attribtues($($compileNodes[i]));
                let directives = collectDirectives($compileNodes[i], attrs, maxPriority);
                let nodeLinkFn;
                if (directives.length) {
                    nodeLinkFn = applyDirectivesToNode(directives, $compileNodes[i], attrs);
                }
                let childLinkFn;
                if ((!nodeLinkFn || !nodeLinkFn.terminal) &&
                    $compileNodes[i].childNodes && $compileNodes[i].childNodes.length) {
                    childLinkFn = compileNodes($compileNodes[i].childNodes);
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

            function compositeLinkFn(scope, linkNodes, parentBoundTranscludeFn) {
                let stableNodeList = [];
                _.forEach(linkFns, (linkFn) => {
                    let nodeIdx = linkFn.idx;
                    stableNodeList[nodeIdx] = linkNodes[nodeIdx];
                });
                _.forEach(linkFns, (linkFn) => {
                    let node = stableNodeList[linkFn.idx];
                    if (linkFn.nodeLinkFn) {
                        let childScope;
                        if (linkFn.nodeLinkFn.scope) {
                            childScope = scope.$new();
                            $(node).data('$scope', childScope);
                        } else {
                            childScope = scope;
                        }
                        let boundTranscludeFn;
                        if (linkFn.nodeLinkFn.transcludeOnThisElement) {
                            boundTranscludeFn = function(transcludedScope, cloneAttachFn, transcludeControllers, containingScope) {
                                if (!transcludedScope) {
                                    transcludedScope = scope.$new(false, containingScope);
                                }
                                return linkFn.nodeLinkFn.transclude(transcludedScope, cloneAttachFn, {
                                    transcludeControllers: transcludeControllers
                                });
                            };
                        } else if (parentBoundTranscludeFn) {
                            boundTranscludeFn = parentBoundTranscludeFn;
                        }
                        linkFn.nodeLinkFn(
                            linkFn.childLinkFn,
                            childScope, 
                            node,
                            boundTranscludeFn
                        );
                    } else {
                        linkFn.childLinkFn(
                            scope,
                            node.childNodes,
                            parentBoundTranscludeFn
                        );
                    }
                });
            }

            return compositeLinkFn;
        }

        function initializeDirectiveBindings(scope, attrs, destination, bindings, newScope) {
            _.forEach(bindings,
            (definition, scopeName) => {
                let attrName = definition.attrName;
                let parentGet, unwatch;
                switch(definition.mode) {
                    case '@':
                        attrs.$observe(attrName, (newAttrValue) => {
                            destination[scopeName] = newAttrValue;
                        });
                        if (attrs[attrName]) {
                            destination[scopeName] = $interpolate(attrs[attrName])(scope);
                        }
                        break;
                    case '<':
                        if (definition.optional && !attrs[attrName]) {
                            break;
                        }
                        parentGet = $parse(attrs[attrName]);
                        destination[scopeName] = parentGet(scope); //scope is parent scope
                        unwatch = scope.$watch(parentGet, (newValue) => {
                            destination[scopeName] = newValue;
                        });
                        newScope.$on('$destroy', unwatch);
                        break;
                    case '=':
                        if (definition.optional && !attrs[attrName]) {
                            break;
                        }
                        parentGet = $parse(attrs[attrName]);
                        let lastValue = destination[scopeName] = parentGet(scope);
                        let parentValueWatch = () => {
                            let parentValue = parentGet(scope);
                            if (destination[scopeName] !== parentValue) {
                                if (parentValue !== lastValue) {
                                    destination[scopeName] = parentValue;
                                } else {
                                    parentValue = destination[scopeName];
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
                        newScope.$on('$destroy', unwatch);
                        break;
                    case '&':
                        let parentExpr = $parse(attrs[attrName]);
                        if (parentExpr === _.noop && definition.optional) {
                            break;
                        }
                        destination[scopeName] = (locals) => {
                            return parentExpr(scope, locals);
                        };
                        break;
                    }
                }
            );
        }

        function applyDirectivesToNode(directives, compileNode, attrs, previousCompileContext) {
            previousCompileContext = previousCompileContext || {};
            let $compileNode = $(compileNode);
            let terminalPriority = -Number.MAX_VALUE;
            let terminal = false;
            let preLinkFns = previousCompileContext.preLinkFns || []; 
            let postLinkFns = previousCompileContext.postLinkFns || [];
            let controllers = {};
            let newScopeDirective;
            let newIsolateScopeDirective = previousCompileContext.newIsolateScopeDirective;
            let controllerDirectives = previousCompileContext.controllerDirectives;
            let templateDirective = previousCompileContext.templateDirective;
            let childTranscludeFn;
            let hasTranscludeDirective = previousCompileContext.hasTranscludeDirective;
            let hasElementTranscludeDirective;

            function getControllers(require, $element) {
                if (_.isArray(require)) {
                    return _.map(require, (r) => {
                        return getControllers(r, $element);
                    });
                } else if (_.isObject(require)) {
                    return _.mapValues(require, (r) => {
                        return getControllers(r, $element);
                    });
                } else {
                    let value;
                    let match = require.match(REQUIRE_PREFIX_REGEXP);
                    let optional = match[2];
                    require = require.substring(match[0].length);
                    if (match[1] || match[3]) {
                        if (match[3] && !match[1]) {
                            match[1] = match[3];
                        }
                        if (match[1] === '^^') {
                            $element = $element.parent();
                        }
                        while ($element.length) {
                            value = $element.data('$' + require + 'Controller');
                            if (value) {
                                break;
                            } else {
                                $element = $element.parent();
                            }
                        }
                    } else {
                        if (controllers[require]) {
                            value = controllers[require].instance;
                        }
                    }
                    
                    if (!value && !optional) {
                        throw `Controller ${require} required by directive, cannot be found!`;
                    }
                    return value || null;
                } 
            }

            function addLinkFns(preLinkFn, postLinkFn, attrStart, attrEnd, isolateScope, require) {
                if (preLinkFn) {
                    if (attrStart) {
                        preLinkFn = groupElementsLinkFnWrapper(preLinkFn, attrStart, attrEnd);
                    }
                    preLinkFn.isolateScope = isolateScope;
                    preLinkFn.require = require;
                    preLinkFns.push(preLinkFn);
                }
                if (postLinkFn) {
                    if (attrStart) {
                        postLinkFn = groupElementsLinkFnWrapper(postLinkFn, attrStart, attrEnd);
                    }
                    postLinkFn.isolateScope = isolateScope;
                    postLinkFn.require = require;
                    postLinkFns.push(postLinkFn);
                }
            }

            function compileTemplateUrl(directives, $compileNode, attrs, previousCompileContext) {
                let origAsyncDirective = directives.shift();
                let derivedSyncDirective = _.extend(
                    {},
                    origAsyncDirective,
                    {
                        templateUrl: null,
                        transclude:null
                    }
                );
                let templateUrl = _.isFunction(origAsyncDirective.templateUrl) ? 
                                    origAsyncDirective.templateUrl($compileNode, attrs) : 
                                    origAsyncDirective.templateUrl;
                let afterTemplateNodeLinkFn, afterTemplateChildLinkFn;
                let linkQueue = [];
                $compileNode.empty();
                $http.get(templateUrl).success((template) => {
                    template = denormalizeTemplate(template);
                    directives.unshift(derivedSyncDirective);
                    $compileNode.html(template);
                    afterTemplateNodeLinkFn = applyDirectivesToNode(directives, $compileNode, attrs, previousCompileContext);
                    afterTemplateChildLinkFn = compileNodes($compileNode[0].childNodes);
                    _.forEach(linkQueue, (linkCall) => {
                        afterTemplateNodeLinkFn(
                            afterTemplateChildLinkFn,
                            linkCall.scope,
                            linkCall.linkNode,
                            linkCall.boundTranscludeFn
                        );
                    });
                    linkQueue = null;
                });

                return function delayedNodeLinkFn(_ignoreChildLinkFn, scope, linkNode, boundTranscludeFn) {
                    if (linkQueue) {
                        linkQueue.push({scope: scope, linkNode: linkNode, boundTranscludeFn: boundTranscludeFn});
                    } else {
                     afterTemplateNodeLinkFn(afterTemplateChildLinkFn, scope, linkNode, boundTranscludeFn);
                    }
                }
            }

            function nodeLinkFn(childLinkFn, scope, linkNode, boundTranscludeFn) {
                let $element = $(linkNode);
                let isolateScope;

                if (newIsolateScopeDirective) {
                    isolateScope = scope.$new(true);
                    $element.addClass('ng-isolate-scope');
                    $element.data('$isolateScope', isolateScope);
                }

                if (controllerDirectives) {
                    _.forEach(controllerDirectives, (directive) => {
                        let locals = {
                            $scope: directive === newIsolateScopeDirective ? isolateScope : scope,
                            $element: $element,
                            $transclude: scopeBoundTranscludeFn,
                            $attrs: attrs
                        };
                        let controllerName = directive.controller;
                        if (controllerName === '@') {
                            controllerName = attrs[directive.name];
                        }
                        let controller = $controller(controllerName, locals, true, directive.controllerAs);
                        controllers[directive.name] = controller;
                        $element.data('$' + directive.name + 'Controller', controller.instance);
                    });
                }

                if (newIsolateScopeDirective) {
                    initializeDirectiveBindings(
                        scope,
                        attrs,
                        isolateScope,
                        newIsolateScopeDirective.$$bindings.isolateScope,
                        isolateScope
                    );
                }

                let scopeDirective = newIsolateScopeDirective || newScopeDirective;
                if (scopeDirective && controllers[scopeDirective.name]) {
                    initializeDirectiveBindings(
                        scope,
                        attrs,
                        controllers[scopeDirective.name].instance,
                        scopeDirective.$$bindings.bindToController,
                        isolateScope
                    );
                }

                _.forEach(controllers, (controller) => {
                    controller();
                });
                _.forEach(controllerDirectives, (controllerDirective, name) => {
                    let require = controllerDirective.require;
                    if (_.isObject(require) && !_.isArray(require) && 
                        controllerDirective.bindToController) {
                            let controller = controllers[controllerDirective.name].instance;
                            let requiredControllers = getControllers(require, $element);
                            _.assign(controller, requiredControllers);
                        }
                });

                function scopeBoundTranscludeFn(transcludedScope, cloneAttachFn) {
                    let transcludeControllers;
                    if (!transcludedScope || !transcludedScope.$watch || !transcludedScope.$evalAsync) {
                        cloneAttachFn = transcludedScope;
                        transcludedScope = undefined;
                    }
                    if (hasElementTranscludeDirective) {
                        transcludeControllers = controllers;
                    }
                    return boundTranscludeFn(transcludedScope, cloneAttachFn, transcludeControllers, scope);
                }
                scopeBoundTranscludeFn.$$boundTransclude = boundTranscludeFn;

                _.forEach(preLinkFns, (linkFn) => {
                    linkFn(
                        linkFn.isolateScope ? isolateScope : scope, 
                        $element, 
                        attrs,
                        linkFn.require && getControllers(linkFn.require, $element),
                        scopeBoundTranscludeFn
                    );
                });
                if (childLinkFn) {
                    let scopeToChild = scope;
                    if (newIsolateScopeDirective &&
                        (newIsolateScopeDirective.template ||
                        newIsolateScopeDirective.templateUrl === null)) {
                        scopeToChild = isolateScope;
                    }
                    childLinkFn(scopeToChild, linkNode.childNodes, boundTranscludeFn);
                }
                _.forEachRight(postLinkFns, (linkFn) => {
                    linkFn(
                        linkFn.isolateScope ? isolateScope : scope, 
                        $element, 
                        attrs,
                        linkFn.require && getControllers(linkFn.require, $element),
                        scopeBoundTranscludeFn
                    );
                });
            }

            _.forEach(directives, (directive, i) => {
                if (directive.$$start) {
                    $compileNode = groupScan(compileNode, directive.$$start, directive.$$end);
                }
                if (directive.priority < terminalPriority) {
                    return false; //early exit of _.forEach
                }
                if (directive.scope && !directive.templateUrl) {
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
                if (directive.terminal) {
                    terminal = true;
                    terminalPriority = directive.priority;
                }
                if (directive.controller) {
                    controllerDirectives = controllerDirectives || {};
                    controllerDirectives[directive.name] = directive;
                }
                if (directive.transclude) {
                    if (hasTranscludeDirective) {
                        throw 'Multiple directives asking for transclude';
                    }
                    hasTranscludeDirective = true;
                    if (directive.transclude === 'element') {
                        hasElementTranscludeDirective = true;
                        let $originalCompileNode = $compileNode;
                        $compileNode = attrs.$$element = $(document.createComment(' ' + directive.name + ': ' + attrs[directive.name] + ' '));
                        $originalCompileNode.replaceWith($compileNode);
                        terminalPriority = directive.priority;
                        childTranscludeFn = compile($originalCompileNode, terminalPriority);
                    } else {
                        let $transcludedNodes = $compileNode.clone().contents();
                        childTranscludeFn = compile($transcludedNodes);
                        $compileNode.empty();
                    }      
                }
                if (directive.template) {
                    if (templateDirective) {
                        throw 'Multiple directives asking for template';
                    }
                    templateDirective = directive;
                    let template = _.isFunction(directive.template) ?
                                    directive.template($compileNode, attrs) :
                                    directive.template;
                    template = denormalizeTemplate(template);
                    $compileNode.html(template);
                }
                if (directive.templateUrl) {
                    if (templateDirective) {
                        throw 'Multiple directives asking for template';
                    }
                    templateDirective = directive;
                    nodeLinkFn = compileTemplateUrl(
                        _.drop(directives, i), 
                        $compileNode, 
                        attrs,
                        {
                            templateDirective: templateDirective,
                            preLinkFns: preLinkFns,
                            postLinkFns: postLinkFns,
                            newIsolateScopeDirective: newIsolateScopeDirective,
                            controllerDirectives: controllerDirectives,
                            hasTranscludeDirective: hasTranscludeDirective
                        }
                    );
                    return false;
                } else if (directive.compile) {
                    let linkFn = directive.compile($compileNode, attrs);
                    let isolateScope = (directive === newIsolateScopeDirective);
                    let attrStart = directive.$$start;
                    let attrEnd = directive.$$end;
                    let require = directive.require;
                    if (_.isFunction(linkFn)) {
                        addLinkFns(null, linkFn, attrStart, attrEnd, isolateScope, require);
                    } else if (linkFn) {
                        addLinkFns(linkFn.pre, linkFn.post, attrStart, attrEnd, isolateScope, require);
                    }
                }
            });

            nodeLinkFn.terminal = terminal;
            nodeLinkFn.scope = newScopeDirective && newScopeDirective.scope;
            nodeLinkFn.transcludeOnThisElement = hasTranscludeDirective;
            nodeLinkFn.transclude = childTranscludeFn;
            return nodeLinkFn;
        }

        function collectDirectives(node, attrs, maxPriority) {
            let directives = [];
            let match;
            if (node.nodeType === Node.ELEMENT_NODE) {
                let normalizedNodeName = directiveNormalize(nodeName(node).toLowerCase());
                addDirective(directives, normalizedNodeName, 'E', maxPriority);
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
                    addAttrInterpolateDirective(directives, attr.value, normalizedAttrName);
                    addDirective(directives, normalizedAttrName, 'A', maxPriority,
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
                        if (addDirective(directives, normalizedClassName, 'C', maxPriority)) {
                            attrs[normalizedClassName] = match[2] ? match[2].trim() : undefined;
                        }
                        className = className.substr(match.index + match[0].length);
                    }
                }
            } else if (node.nodeType === Node.COMMENT_NODE) {
                match = /^\s*directive\:\s*([\d\w\-_]+)\s*(.*)$/.exec(node.nodeValue);
                if (match) {
                    let normalizedName = directiveNormalize(match[1]);
                    if (addDirective(directives, directiveNormalize(match[1]), 'M', maxPriority)) {
                        attrs[normalizedName] = match[2] ? match[2].trim() : undefined;
                    }
                    
                }
            } else if (node.nodeType === Node.TEXT_NODE) {
                addTextInterpolateDirective(directives, node.nodeValue);
            }
            directives.sort(byPriority);
            return directives;
        }

        function addAttrInterpolateDirective(directives, value, name) {
            let interpolateFn = $interpolate(value, true);
            if (interpolateFn) {
                directives.push({
                    priority: 100,
                    compile: function() {
                        return {
                            pre: function link(scope, element, attrs) {
                                if (/^(on[a-z]+|formaction)$/.test(name)) {
                                    throw 'Interpolations for HTML DOM event attributes not allowed';
                                }
                                let newValue = attrs[name];
                                if (newValue !== value) {
                                    interpolateFn = newValue && $interpolate(newValue, true);
                                }
                                if (!interpolateFn) {
                                    return;
                                }

                                attrs.$$observers = attrs.$$observers || {};
                                attrs.$$observers[name] = attrs.$$observers[name] || [];
                                attrs.$$observers[name].$$inter = true;

                                attrs[name] = interpolateFn(scope);
                                scope.$watch(interpolateFn, (newValue) => {
                                    attrs.$set(name, newValue);
                                });
                            }
                        };
                    }
                })
            }
        }

        function addTextInterpolateDirective(directives, text) {
            let interpolateFn = $interpolate(text, true);
            if (interpolateFn) {
                directives.push({
                    priority: 0,
                    compile: function() {
                        return function link(scope, element) {
                            let bindings = element.parent().data('$binding') || [];
                            bindings = bindings.concat(interpolateFn.expressions);
                            element.parent().data('$binding', bindings);
                            element.parent().addClass('ng-binding');
                            scope.$watch(interpolateFn, (newValue) => {
                                element[0].nodeValue = newValue;
                            });
                        };
                    }
                });
            }
        }

        function addDirective(directives, name, mode, maxPriority, attrStartName, attrEndName) {
            let match;
            if (hasDirectives.hasOwnProperty(name)) {
                let foundDirectives = $injector.get(name + 'Directive');
                let applicableDirectives = _.filter(foundDirectives, (dir) => {
                    return (maxPriority === undefined || maxPriority > dir.priority) && dir.restrict.indexOf(mode) !== -1;
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
            return function(scope, element, attrs, ctrl, transclude) {
                let group = groupScan(element[0], attrStart, attrEnd);
                return linkFn(scope, group, attrs, ctrl, transclude);
            };
        }

        function isBooleanAttribute(node, attrName) {
            return BOOLEAN_ATTRS[attrName] && BOOLEAN_ELEMENTS[node.nodeName];
        }

        return compile;
    }];

    $CompileProvider.$inject = ['$provide'];
}