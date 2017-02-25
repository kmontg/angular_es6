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
            this.$digest();
        }
    }

    // $eval during the current digest 
    // triggers a digest if one isn't scheduled or one isn't ongoing when the timeout runs (i.e. the asyncQueue still has items)
    $evalAsync(expr) {
        if (!this.$$phase && !this.$$asyncQueue.length) {
            setTimeout(() => {
                if(this.$$asyncQueue.length) {
                    this.$digest();
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
        if(this.$$applyAsyncId === null) {
            this.$$applyAsyncId = setTimeout(() => {
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
        this.$$applyAsyncId = null;
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
        this.$$lastDirtyWatch = null;
        return () => {
            let index = this.$$watchers.indexOf(watcher);
            if (index >= 0) {
                this.$$watchers.splice(index, 1);
                this.$$lastDirtyWatch = null;
            }
        };
    }

    $digest() {
        let dirty;
        let ttl = 10;
        this.$$lastDirtyWatch = null;
        this.$beginPhase('$digest');

        if (this.$$applyAsyncId) {
            clearTimeout(this.$$applyAsyncId);
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

    $$digestOnce() {
        let newValue, oldValue, dirty;
        _.forEachRight(this.$$watchers, (watcher) => {
            try {
                if (watcher) {
                    newValue = watcher.watchFn(this);
                    oldValue = watcher.last;
                    if(!this.$$areEqual(newValue, oldValue, watcher.valueEq)) {
                        // dirty
                        this.$$lastDirtyWatch = watcher;
                        watcher.last = (watcher.valueEq ? _.cloneDeep(newValue) : newValue);
                        watcher.listenerFn(newValue, 
                            (oldValue === initWatchVal ? newValue : oldValue), 
                            this);
                        dirty = true;
                    } else if (this.$$lastDirtyWatch === watcher) {
                        // clean short-circuit
                        return false;
                    }
                }
            } catch (e) {
                // too much noise in unit tests
                // console.error(e);
            }
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
}