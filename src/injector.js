import _ from 'lodash';

let FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
let FN_ARG = /^\s*(_?)(\S+?)\1\s*$/;
let STRIP_COMMENTS = /(\/\/.*$)|(\/\*.*?\*\/)/mg;

export default function createInjector(modulesToLoad, strictDi) {
    let cache = {};
    let loadedModules = {};
    strictDi = (strictDi === true);
    let $provide = {
        constant: function(key, value) {
            if (key === 'hasOwnProperty') {
                throw 'hasOwnProperty is not a valid constant name!';
            }
            cache[key] = value;
        }
    }

    function annotate(fn) {
        if (_.isArray(fn)) {
            return fn.slice(0, fn.length - 1);
        } else if (fn.$inject) {
            return fn.$inject;
        } else if (!fn.length) {
            return [];
        } else {
            if (strictDi) {
                throw 'fn is not using explicit annotation and ' +
                        'cannot be invoked in strict mode';
            }
            let source = fn.toString().replace(STRIP_COMMENTS, '');
            let argDeclaration = source.match(FN_ARGS);
            return _.map(argDeclaration[1].split(','), (argName) => {
                return argName.match(FN_ARG)[2];
            });
        }
    }

    function invoke(fn, self, locals) {
        let args = _.map(annotate(fn), (token) => {
            if (_.isString(token)) {
                return locals && locals.hasOwnProperty(token) ?
                    locals[token] :
                    cache[token];
            } else {
                throw `Incorrect injection token! Expect a string, got ${token}`;
            }
        });
        if (_.isArray(fn)) {
            fn = _.last(fn);
        }
        return fn.apply(self, args);
    };

    _.forEach(modulesToLoad, function loadModule(moduleName) {
        if (!loadedModules.hasOwnProperty(moduleName)) {
            loadedModules[moduleName] = true;
            let module = window.angular.module(moduleName);
            _.forEach(module.requires, loadModule);
            _.forEach(module._invokeQueue, (invokeArgs) => {
                let method = invokeArgs[0];
                let args = invokeArgs[1];
                // There are a few spots in parse.js where ... could be used instead of apply();
                $provide[method](...args);
        });
        }
    });

    function instantiate(Type, locals) {
        let UnwrappedType = _.isArray(Type) ? _.last(Type) : Type;
        let instance = Object.create(UnwrappedType.prototype);
        invoke(Type, instance, locals);
        return instance;
    }

    return {
        has: function(key) {
            return cache.hasOwnProperty(key);
        },
        get: function(key) {
            return cache[key];
        },
        annotate: annotate,
        invoke: invoke,
        instantiate: instantiate
    };
}