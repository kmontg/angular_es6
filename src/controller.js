import _ from 'lodash';

let CNTRL_REG = /^(\S+)(\s+as\s+(\w+))?/;

function addToScope(locals, identifier, instance) {
    if (locals && _.isObject(locals.$scope)) {
        locals.$scope[identifier] = instance;
    } else {
        throw `Cannot export controller as ${identifier}! No $scope object provided via locals`;
    }
}

function identifierForController(ctrl) {
    if (_.isString(ctrl)) {
        let match = CNTRL_REG.exec(ctrl);
        if (match) {
            return match[3];
        }
    }
}

function $ControllerProvider() {
    
    let controllers = {};
    let globals = false;

    this.allowGlobals = function() {
        globals = true;
    };

    this.register = function(name, controller) {
        if (_.isObject(name)) {
            _.extend(controllers, name);
        } else {
            controllers[name] = controller;
        }
    };
    
    this.$get = ['$injector', function($injector) {
        return function(ctrl, locals, later, identifier) {
            if (_.isString(ctrl)) {
                let match = ctrl.match(CNTRL_REG);
                ctrl = match[1];
                identifier = identifier || match[3];
                if (controllers.hasOwnProperty(ctrl)) {
                    ctrl = controllers[ctrl];
                } else {
                    ctrl = (locals && locals.$scope && locals.$scope[ctrl]) ||
                            (globals && window[ctrl]);
                } 
            }
            let instance;
            if (later) {
                let ctrlConstructor = _.isArray(ctrl) ? _.last(ctrl) : ctrl;
                instance = Object.create(ctrlConstructor.prototype);
                if (identifier) {
                    addToScope(locals, identifier, instance);
                }
                return _.extend(
                    function() {
                        $injector.invoke(ctrl, instance, locals);
                        return instance;
                    }, {
                        instance: instance
                    }
                );
            } else {
                instance = $injector.instantiate(ctrl, locals);
                if (identifier) {
                    addToScope(locals, identifier, instance);
                }
                return instance;
            }
        };
    }];
}

export {identifierForController, $ControllerProvider as default};