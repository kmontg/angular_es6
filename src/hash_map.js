import _ from 'lodash';

function hashKey(value) {
    let type = typeof value;
    let uid;
    if (type === 'function' || (type === 'object' && value !== null)) {
        uid = value.$$hashKey;
        if (typeof uid === 'function') {
            uid = value.$$hashKey();
        } else if (uid === undefined) {
            uid = value.$$hashKey = _.uniqueId();
        }
    } else {
        uid = value;
    }
    return type + ':' + uid;
}

class HashMap {
    constructor() {

    }

    put(key, value) {
        this[hashKey(key)] = value;
    }

    get(key) {
        return this[hashKey(key)];
    }

    remove(key) {
        key = hashKey(key);
        let value = this[key];
        delete this[key];
        return value;
    }
}

export {hashKey, HashMap};