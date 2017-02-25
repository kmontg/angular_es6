import _ from 'lodash';

const initWatchVal = Symbol('initWatchVal'); //could possibly use ES7 public class field feature https://tc39.github.io/proposal-class-public-fields/

export default class Scope {
    
    constructor(){
        this.$$watchers = [];
        this.$$lastDirtyWatch = null;
        this.$$asyncQueue = [];
        this.$$applyAsyncQueue = [];
        this.$$applyAsyncId = null;
        this.$$postDigestQueue = [];
        this.$root = this;
        this.$$children = [];
        this.$$phase = null;
    }

    // only executes, does not trigger digest
    $eval(expr, locals) {
        return expr(this, locals);
    }

    // attempts to $eval and then triggers $digest
    $apply(expr) {
        try {
            this.$beginPhase('$apply');
            this.$eval(expr);
        } finally {
            this.$clearPhase();
            this.$root.$digest();
        }
    }

    // $eval during the current digest 
    // triggers a digest if one isn't scheduled or one isn't ongoing when the timeout runs (i.e. the asyncQueue still has items)
    $evalAsync(expr) {
        if (!this.$$phase && !this.$$asyncQueue.length) {
            setTimeout(() => {
                if(this.$$asyncQueue.length) {
                    this.$root.$digest();
                }
            }, 0);
        }
        this.$$asyncQueue.push({
                scope: this,
                expression: expr
            });
    }

    $applyAsync(expr) {
        this.$$applyAsyncQueue.push(() => {
            this.$eval(expr);
        });
        // coalesces many calls to $applyAsync
        if(this.$root.$$applyAsyncId === null) {
            this.$root.$$applyAsyncId = setTimeout(() => {
                this.$apply(() => {
                    this.$$flushApplyAsync();
                });
            }, 0);
        }
    }

    $$flushApplyAsync() {
        while (this.$$applyAsyncQueue.length) {
            try {
                this.$$applyAsyncQueue.shift()();
            } catch(e) {
                console.error(e);
            } 
        }
        this.$root.$$applyAsyncId = null;
    }

    $beginPhase(phase) {
        if(this.$$phase) {
            throw `${this.$$phase} already in progress.`;
        }
        this.$$phase = phase;
    }

    $clearPhase() {
        this.$$phase = null;
    }

    $$postDigest(fn) {
        this.$$postDigestQueue.push(fn);
    }

    $watch(watchFn, listenerFn, valueEq) {
        let watcher = {
            watchFn: watchFn,
            listenerFn: listenerFn || function(){ },
            valueEq: !!valueEq,
            last: initWatchVal
        };
        this.$$watchers.unshift(watcher);
        this.$root.$$lastDirtyWatch = null;
        return () => {
            let index = this.$$watchers.indexOf(watcher);
            if (index >= 0) {
                this.$$watchers.splice(index, 1);
                this.$root.$$lastDirtyWatch = null;
            }
        };
    }

    $watchCollection(watchFn, listenerFn) {
        let newValue, oldValue;
        let changeCount = 0;
        let oldLength = 0;
        let veryOldValue;
        let trackVeryOldValue = (listenerFn.length > 1);
        let firstRun = true;

        let internalWatchFn = (scope) => {
            let newLength;
            newValue = watchFn(scope);

            if (_.isObject(newValue)) {
                if (this.$$isArrayLike(newValue)) {
                    if(!_.isArray(oldValue)) {
                        changeCount++;
                        oldValue = [];
                    }
                    if (newValue.length !== oldValue.length) {
                        changeCount++;
                        oldValue.length = newValue.length;
                    }
                    _.forEach(newValue, (newItem, i) => {
                        let bothNaN = _.isNaN(newItem) && _.isNaN(oldValue[i]);
                        if (!bothNaN && newItem !== oldValue[i]) {
                            changeCount++;
                            oldValue[i] = newItem;
                        }
                    });
                } else {
                    // other object type
                    if (!_.isObject(oldValue) || this.$$isArrayLike(oldValue)) {
                        changeCount++;
                        oldValue = {};
                        oldLength = 0;
                    }
                    newLength = 0;
                    _.forOwn(newValue, (newVal, key) => {
                        newLength++;
                        if (oldValue.hasOwnProperty(key)) {
                            let bothNaN = _.isNaN(newVal) && _.isNaN(oldValue[key]);
                            if (!bothNaN && oldValue[key] !== newVal) {
                                changeCount++;
                                oldValue[key] = newVal;
                            }
                        } else {
                            changeCount++;
                            oldLength++;
                            oldValue[key] = newVal;
                        }
                    });
                    if (oldLength > newLength) {
                        changeCount++;
                        _.forOwn(oldValue, (oldVal, key) => {
                            if (!newValue.hasOwnProperty(key)) {
                                oldLength--;
                                delete oldValue[key];
                            }
                        });
                    }
                }
            } else {
                 // check for changes
                if (!this.$$areEqual(newValue, oldValue, false)) {
                    changeCount++;
                }
                oldValue = newValue;
            }

            return changeCount;
        };

        let internalListenerFn = () => {
            if (firstRun) {
                listenerFn(newValue, newValue, this);
                firstRun = false;
            } else {
                listenerFn(newValue, veryOldValue, this);
            }
            
            if (trackVeryOldValue) {
                veryOldValue = _.clone(newValue);
            }
        };

        return this.$watch(internalWatchFn, internalListenerFn);
    }

    $digest() {
        let dirty;
        let ttl = 10;
        this.$root.$$lastDirtyWatch = null;
        this.$beginPhase('$digest');

        if (this.$root.$$applyAsyncId) {
            clearTimeout(this.$root.$$applyAsyncId);
            this.$$flushApplyAsync();
        }

        do {
            while (this.$$asyncQueue.length) {
                try {
                    let asyncTask = this.$$asyncQueue.shift();
                    asyncTask.scope.$eval(asyncTask.expression);
                } catch(e) {
                    console.error(e);
                }
            }
            dirty = this.$$digestOnce();
            if ((dirty || this.$$asyncQueue.length) && !(ttl--)) {
                this.$clearPhase();
                throw `${ttl} + 'digest iterations reached`;
            }
        } while (dirty || this.$$asyncQueue.length);
        this.$clearPhase();

        while(this.$$postDigestQueue.length) {
            try {
                this.$$postDigestQueue.shift()();
            } catch(e) {
                console.error(e);
            }
        }
    }

    $$everyScope(fn) {
        // call fn for each child scope and short-circuit if any of them return false
        if (fn(this)) {
            return this.$$children.every((child) => {
                return child.$$everyScope(fn);
            });
        } else {
            return false;
        }
    }

    $$digestOnce() {
        let dirty;
        let continueLoop = true;
        this.$$everyScope((scope) => {
            let newValue, oldValue;
            _.forEachRight(scope.$$watchers, (watcher) => {
                try {
                    if (watcher) {
                        newValue = watcher.watchFn(scope);
                        oldValue = watcher.last;
                        if(!scope.$$areEqual(newValue, oldValue, watcher.valueEq)) {
                            // dirty
                            scope.$root.$$lastDirtyWatch = watcher;
                            watcher.last = (watcher.valueEq ? _.cloneDeep(newValue) : newValue);
                            watcher.listenerFn(newValue, 
                                (oldValue === initWatchVal ? newValue : oldValue), 
                                scope);
                            dirty = true;
                        } else if (scope.$root.$$lastDirtyWatch === watcher) {
                            continueLoop = false;
                            return false; // short-circuit _.forEach
                        }
                    }
                } catch (e) {
                    // too much noise in unit tests
                    console.error(e);
                }
            });
            return continueLoop;
        });
        
        return dirty;
    }

    $$areEqual(newValue, oldValue, valueEq) {
        if (valueEq) {
            return _.isEqual(newValue, oldValue);
        } else {
            return newValue === oldValue ||
                (typeof newValue === 'number' && typeof oldValue === 'number' &&
                    isNaN(newValue) && isNaN(oldValue));
        }
    }

    $watchGroup(watchFns, listenerFn) {
        // newValues/oldValues stored in closure
        let newValues = new Array(watchFns.length);
        let oldValues = new Array(watchFns.length);
        let changeReactionScheduled = false;
        let firstRun = true;

        if (watchFns.length === 0) {
            let shouldCall = true;
            this.$evalAsync(() => {
                if (shouldCall) {
                    listenerFn(newValues, newValues, this);
                }
            });
            return function() {
                shouldCall = false;
            };
        }

        function watchGroupListener() {
            if (firstRun) {
                firstRun = false;
                listenerFn(newValues, newValues, this);
            } else {
                listenerFn(newValues, oldValues, this);
            }
            changeReactionScheduled = false;
        }

        let destroyFunctions = _.map(watchFns, (watchFn, i) => {
            return this.$watch(watchFn, (newValue, oldValue) => {
                newValues[i] = newValue;
                oldValues[i] = oldValue;
                if(!changeReactionScheduled) {
                    changeReactionScheduled = true;
                    this.$evalAsync(watchGroupListener);
                }
            });
        });

        return function() {
            _.forEach(destroyFunctions, (destroyFunction) => {
                destroyFunction();
            });
        }
    }

    $new(isolated, parent) {
        let child;
        parent = parent || this;
        if (isolated) {
            child = new Scope();
            child.$root = parent.$root;
            child.$$asyncQueue = parent.$$asyncQueue;
            child.$$postDigestQueue = parent.$$postDigestQueue;
            child.$$applyAsyncQueue = parent.$$applyAsyncQueue;
        } else {
            child = Object.create(this);
        }
        
        parent.$$children.push(child);
        child.$$watchers = [];
        child.$$children = [];
        child.$parent = parent;
        
        return child;
    }

    $destroy() {
        if (this.$parent) {
            let siblings = this.$parent.$$children;
            let indexOfThis = siblings.indexOf(this);
            if (indexOfThis >= 0) {
                siblings.splice(indexOfThis, 1);
            }
        }
        this.$$watchers = null;
    }

    $$isArrayLike(obj) {
        if(_.isNaN(obj) || _.isUndefined(obj)) {
            return false;
        } 
        let length = obj.length;
        return length === 0 || 
            (_.isNumber(length) && length > 0 && (length - 1) in obj); //https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/in
    }
}