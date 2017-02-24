import _ from 'lodash';

const initWatchVal = Symbol('initWatchVal'); //could possibly use ES7 public class field feature https://tc39.github.io/proposal-class-public-fields/

export default class Scope {
    
    constructor(){
        this.$$watchers = [];
        this.$$lastDirtyWatch = null;
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
        do {
            dirty = this.$$digestOnce();
            ttl--; // http://stackoverflow.com/questions/971312/why-avoid-increment-and-decrement-operators-in-javascript
            if (dirty && !ttl) {
                throw `${ttl} + 'digest iterations reached`;
            }
        } while (dirty);
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
                        // clean
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
}