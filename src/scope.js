const initWatchVal = Symbol('initWatchVal'); //could possibly use ES7 public class field feature https://tc39.github.io/proposal-class-public-fields/

export default class Scope {
    
    constructor(){
        this.$$watchers = [];
    }

    $watch(watchFn, listenerFn) {
        let watcher = {
            watchFn: watchFn,
            listenerFn: listenerFn,
            last: initWatchVal
        };

        this.$$watchers.push(watcher);
    }

    $digest() {
        let newValue, oldValue;
        this.$$watchers.forEach((watcher)=>{
            newValue = watcher.watchFn(this);
            oldValue = watcher.last;
            if(newValue !== oldValue){
                watcher.last = newValue;
                watcher.listenerFn(newValue, oldValue, this);
            }
        });
    }
}