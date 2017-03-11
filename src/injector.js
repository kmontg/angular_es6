import _ from 'lodash';
import {HashMap} from 'hash_map';

let FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
let FN_ARG = /^\s*(_?)(\S+?)\1\s*$/;
let STRIP_COMMENTS = /(\/\/.*$)|(\/\*.*?\*\/)/mg;
let INSTANTIATING = { };

export default function createInjector(modulesToLoad, strictDi) {
    let providerCache = {};
    let providerInjector = providerCache.$injector = createInternalInjector(providerCache, () => {
        throw 'Unknown provider: ' + path.join(' <- ');
    });
    let instanceCache = {};
    let instanceInjector = instanceCache.$injector = createInternalInjector(instanceCache, (name) => {
        let provider = providerInjector.get(name + 'Provider');
        return instanceInjector.invoke(provider.$get, provider);
    });
    let loadedModules = new HashMap();
    let path = [];
    strictDi = (strictDi === true);

    function enforceReturnValue(factoryFn) {
        return function() {
            let value = instanceInjector.invoke(factoryFn);
            if (_.isUndefined(value)) {
                throw 'factory must return a value';
            }
            return value;
        };
    }

    providerCache.$provide = {
        constant: function(key, value) {
            if (key === 'hasOwnProperty') {
                throw 'hasOwnProperty is not a valid constant name!';
            }
            instanceCache[key] = value;
            providerCache[key] = value;
        },
        provider: function(key, provider) {
            if (_.isFunction(provider)) {
                provider = providerInjector.instantiate(provider);
            }
            providerCache[key + 'Provider'] = provider;
        },
        factory: function(key, factoryFn, enforce) {
            this.provider(key, {$get: enforce === false ? factoryFn : enforceReturnValue(factoryFn)});
        },
        value: function(key, value) {
            this.factory(key, _.constant(value), false);
        },
        service: function(key, Constructor) {
            this.factory(key, () => {
                return instanceInjector.instantiate(Constructor);
            })
        },
        decorator: function(serviceName, decoratorFn) {
            let provider = providerInjector.get(serviceName + 'Provider');
            let original$get = provider.$get;
            provider.$get = () => {
                let instance = instanceInjector.invoke(original$get, provider);
                instanceInjector.invoke(decoratorFn, null, {$delegate: instance});
                return instance;
            };
        }
    }

    function createInternalInjector(cache, factoryFn) {

        function invoke(fn, self, locals) {
            let args = _.map(annotate(fn), (token) => {
                if (_.isString(token)) {
                    return locals && locals.hasOwnProperty(token) ?
                        locals[token] :
                        getService(token);
                } else {
                    throw `Incorrect injection token! Expect a string, got ${token}`;
                }
            });
            if (_.isArray(fn)) {
                fn = _.last(fn);
            }
            return fn.apply(self, args);
        };

        function getService(name) {
            if (cache.hasOwnProperty(name)) {
                if (cache[name] === INSTANTIATING) {
                    throw new Error('Circular dependency found: ' +
                        name + ' <- ' + path.join(' <- '));
                }
                return cache[name];
            } else {
                path.unshift(name);
                cache[name] = INSTANTIATING;
                try {
                    return (cache[name] = factoryFn(name));
                } finally {
                    path.shift();
                    if (cache[name] === INSTANTIATING) {
                        delete cache[name];
                    }
                }
            }
        };

        function instantiate(Type, locals) {
            let UnwrappedType = _.isArray(Type) ? _.last(Type) : Type;
            let instance = Object.create(UnwrappedType.prototype);
            invoke(Type, instance, locals);
            return instance;
        };

        return {
            has: function(key) {
                return cache.hasOwnProperty(key) ||
                    providerCache.hasOwnProperty(key + 'Provider');
            },
            get: getService,
            annotate: annotate,
            invoke: invoke,
            instantiate: instantiate
        };
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

    function runInvokeQueue(queue) {
        _.forEach(queue, (invokeArgs) => {
            let service = providerInjector.get(invokeArgs[0]);
            let method = invokeArgs[1];
            let args = invokeArgs[2];
            service[method](...args);
        });
    }

    let runBlocks = [];
    _.forEach(modulesToLoad, function loadModule(module) {
        if (!loadedModules.get(module)) {
            loadedModules.put(module, true);
            if (_.isString(module)) {
                if (!loadedModules.hasOwnProperty(module)) {
                    loadedModules[module] = true;
                    module = window.angular.module(module);
                    _.forEach(module.requires, loadModule);
                    runInvokeQueue(module._invokeQueue);
                    runInvokeQueue(module._configBlocks);
                    runBlocks = runBlocks.concat(module._runBlocks);
                }
            } else if (_.isFunction(module) || _.isArray(module)) {
                runBlocks.push(providerInjector.invoke(module));
            }
        } 
    });

    _.forEach(_.compact(runBlocks), (runBlock) => {
        instanceInjector.invoke(runBlock);
    });

    return instanceInjector;
}