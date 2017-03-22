export default function setupModuleLoader(window) {
    let ensure = function(obj, name, factory) {
        return obj[name] || (obj[name] = factory());
    };
    
    let angular = ensure(window, 'angular', Object);

    let createModule = function(name, requires, modules, configFn) {
        if (name === 'hasOwnProperty') {
            throw 'hasOwnProperty is not a valid module name';
        }
        let invokeLater = function(service, method, arrayMethod, queue) {
            return function(...args) {
                queue = queue || invokeQueue;
                queue[arrayMethod || 'push']([service, method, args]);
                return moduleInstance;
            };
        };
        let invokeQueue = [];
        let configBlocks = [];
        let moduleInstance = {
            name: name,
            requires: requires,
            constant: invokeLater('$provide', 'constant', 'unshift'),
            provider: invokeLater('$provide', 'provider'),
            factory: invokeLater('$provide', 'factory'),
            value: invokeLater('$provide', 'value'),
            service: invokeLater('$provide', 'service'),
            decorator: invokeLater('$provide', 'decorator'),
            filter: invokeLater('$filterProvider', 'register'),
            directive: invokeLater('$compileProvider', 'directive'),
            controller: invokeLater('$controllerProvider', 'register'),
            component: invokeLater('$compileProvider', 'component'),
            config: invokeLater('$injector', 'invoke', 'push', configBlocks),
            run: function(fn) {
                moduleInstance._runBlocks.push(fn);
                return moduleInstance;
            },
            _invokeQueue: invokeQueue,
            _configBlocks: configBlocks,
            _runBlocks: []
        };

        if (configFn) {
            moduleInstance.config(configFn);
        }

        modules[name] = moduleInstance;
        return moduleInstance;
    };

    let getModule = function(name, modules) {
        if (modules.hasOwnProperty(name)) {
            return modules[name];
        } else {
            throw `Module ${name} is not available!`;
        }
    }

    ensure(angular, 'module', function() {
        let modules = {};
        return function(name, requires, configFn) {
            if (requires) {
                return createModule(name, requires, modules, configFn);
            } else {
                return getModule(name, modules);
            }
        };
    });
}