import _ from 'lodash';

function qFactory(callLater) {
    
    function processQueue(state) {
        let pending = state.pending;
        state.pending = undefined;
        _.forEach(pending, (handlers) => {
            let deferred = handlers[0];
            let fn = handlers[state.status];
            try {
                if (_.isFunction(fn)) {
                    deferred.resolve(fn(state.value));
                } else if (state.status === 1) {
                    deferred.resolve(state.value);
                } else {
                    deferred.reject(state.value);
                }
            } catch (e) {
                deferred.reject(e);
            }
        });
    }

    function scheduleProcessQueue(state) {
        callLater(() => {
            processQueue(state);
        });
    }

    function makePromise(value, resolved) {
        let d = new Deferred();
        if (resolved) {
            d.resolve(value);
        } else {
            d.reject(value);
        }
        return d.promise;
    }

    function handleFinallyCallback(callback, value, resolved) {
        let callbackValue = callback();
        if (callbackValue && callbackValue.then) {
            return callbackValue.then(() => {
                return makePromise(value, resolved);
            });
        } else {
            return makePromise(value, resolved);
        }
    }

    class Promise {
        constructor() {
            this.$$state = {};
        }

        then(onFulfilled, onRejected, onProgress) {
            let result = new Deferred();
            this.$$state.pending = this.$$state.pending || [];
            this.$$state.pending.push([result, onFulfilled, onRejected, onProgress]);
            if (this.$$state.status > 0) {
                scheduleProcessQueue(this.$$state);
            }
            return result.promise;
        }

        catch(onRejected) {
            return this.then(null, onRejected);
        }

        finally(callback, progressBack) {
            return this.then((value) => {
                return handleFinallyCallback(callback, value, true);
            }, (rejection) => {
                return handleFinallyCallback(callback, rejection, false);
            }, progressBack);
        }
    }
    
    class Deferred {
        constructor() {
            this.promise = new Promise();
        }

        resolve(value) {
            if (this.promise.$$state.status) {
                return;
            }
            if (value && _.isFunction(value.then)) {
                value.then(
                    _.bind(this.resolve, this),
                    _.bind(this.reject, this),
                    _.bind(this.notify, this)
                );
            } else {
                this.promise.$$state.value = value;
                this.promise.$$state.status = 1;    
                scheduleProcessQueue(this.promise.$$state);
            }   
        }

        reject(reason) {
            if (this.promise.$$state.status) {
                return;
            }
            this.promise.$$state.value = reason;
            this.promise.$$state.status = 2;
            scheduleProcessQueue(this.promise.$$state);
        }

        notify(progress) {
            let pending = this.promise.$$state.pending;
            if (pending && pending.length && !this.promise.$$state.status) {
                callLater(() => {
                    _.forEach(pending, (handlers) => {
                        let deferred = handlers[0];
                        let progressBack = handlers[3];
                        try {
                            deferred.notify(_.isFunction(progressBack) ?
                                            progressBack(progress) :
                                            progress);
                        } catch (e) {
                            console.error(e);
                        }
                    });
                });
            }
        }
    }

    function defer() {
        return new Deferred();
    }

    function reject(rejection) {
        let d = defer();
        d.reject(rejection);
        return d.promise;
    }

    function all(promises) {
        let results = _.isArray(promises) ? [] : {};
        let counter = 0;
        let d = defer();
        _.forEach(promises, (promise, index) => {
            counter++;
            when(promise).then((value) => {
                results[index] = value;
                counter--;
                if (!counter) {
                    d.resolve(results);
                }
            }, (rejection) => {
                d.reject(rejection);
            });
        });
        if (!counter) {
            d.resolve(results);
        }
        return d.promise;
    }

    function when(value, callback, errback, progressback) {
        let d = defer();
        d.resolve(value);
        return d.promise.then(callback, errback, progressback);
    }

    let $Q = function Q(resolver) {
        if (!_.isFunction(resolver)) {
            throw `Expected function, got ${resolver}`;
        }
        let d = defer();
        resolver(
            _.bind(d.resolve, d),
            _.bind(d.reject, d)
        );
        return d.promise;
    }

    return _.extend($Q, {
        defer: defer,
        reject: reject,
        when: when,
        resolve: when,
        all: all
    });
}

export function $QProvider() {
    this.$get = ['$rootScope', function($rootScope) {
        return qFactory((callback) => {
            $rootScope.$evalAsync(callback);
        });
    }];
}

export function $$QProvider() {
    this.$get = ['$rootScope', function($rootScope) {
        return qFactory((callback) => {
            setTimeout(callback, 0);
        });
    }];
}
