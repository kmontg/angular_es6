import _ from 'lodash';
import $ from 'jquery';

let PREFIX_REGEXP = /(x[\:\-_]|data[\:\-_])/i;

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
    
    this.$get = ['$injector', function($injector) {
        function compile($compileNodes) {
            return compileNodes($compileNodes);
        }

        function compileNodes($compileNodes) {
            _.forEach($compileNodes, (node) => {
                let directives = collectDirectives(node);
                let terminal = applyDirectivesToNode(directives, node);
                if (!terminal && node.childNodes && node.childNodes.length) {
                    compileNodes(node.childNodes);
                }
            });
        }

        function applyDirectivesToNode(directives, compileNode) {
            let $compileNode = $(compileNode);
            let terminalPriority = -Number.MAX_VALUE;
            let terminal = false;
            _.forEach(directives, (directive) => {
                if (directive.$$start) {
                    $compileNode = groupScan(compileNode, directive.$$start, directive.$$end);
                }
                if (directive.priority < terminalPriority) {
                    return false; //early exit of _.forEach
                }
                if (directive.compile) {
                    directive.compile($compileNode);
                }
                if (directive.terminal) {
                    terminal = true;
                    terminalPriority = directive.priority;
                }
            });
            return terminal;
        }

        function collectDirectives(node) {
            let directives = [];
            if (node.nodeType === Node.ELEMENT_NODE) {
                let normalizedNodeName = directiveNormalize(nodeName(node).toLowerCase());
                addDirective(directives, normalizedNodeName, 'E');
                _.forEach(node.attributes, (attr) => {
                    let attrStartName, attrEndName;
                    let name = attr.name;
                    let normalizedAttrName = directiveNormalize(name.toLowerCase());
                    if (/^ngAttr[A-Z]/.test(normalizedAttrName)) {
                        name = _.kebabCase(
                            normalizedAttrName[6].toLocaleLowerCase() +
                            normalizedAttrName.substring(7)            
                        );   
                    }
                    let directiveName = normalizedAttrName.replace(/(Start|End)$/, '');
                    if (directiveIsMultiElement(directiveName)) {
                        if (/Start$/.test(normalizedAttrName)) {
                            attrStartName = name;
                            attrEndName = name.substring(0, name.length - 5) + 'End';
                            name = name.substring(0, name.length - 5);
                        }
                    }
                    normalizedAttrName = directiveNormalize(name.toLowerCase());
                    addDirective(directives, normalizedAttrName, 'A', attrStartName, attrEndName);
                });
                _.forEach(node.classList, (cls) => {
                    let normalizedClassName = directiveNormalize(cls);
                    addDirective(directives, normalizedClassName, 'C');
                });
            } else if (node.nodeType === Node.COMMENT_NODE) {
                let match = /^\s*directive\:\s*([\d\w\-_]+)/.exec(node.nodeValue);
                if (match) {
                    addDirective(directives, directiveNormalize(match[1]), 'M');
                }
            }
            directives.sort(byPriority);
            return directives;
        }

        function addDirective(directives, name, mode, attrStartName, attrEndName) {
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
                })
            }
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

        return compile;
    }];

    $CompileProvider.$inject = ['$provide'];
}