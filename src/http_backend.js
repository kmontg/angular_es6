import _ from 'lodash';

export default function $HttpBackendProvider() {
    this.$get = function() {
        return function(method, url, post, callback, headers, timeout, withCredentials) {
            let xhr = new window.XMLHttpRequest();
            let timeoutId;
            xhr.open(method, url, true);
            _.forEach(headers, (value, key) => {
                xhr.setRequestHeader(key, value);
            });
            if (withCredentials) {
                xhr.withCredentials = true;
            }
            xhr.send(post || null);
            xhr.onload = function() {
                if (!_.isUndefined(timeoutId)) {
                    clearTimeout(timeoutId);
                }
                let response = ('response' in xhr) ? xhr.response :
                                                     xhr.responseText;
                let statusText = xhr.statusText || '';
                callback(
                    xhr.status, 
                    response, 
                    xhr.getAllResponseHeaders(),
                    statusText
                );
            };
            xhr.onerror = function() {
                if (!_.isUndefined(timeoutId)) {
                    clearTimeout(timeoutId);
                }
                callback(-1, null, '');
            };
            if (timeout && timeout.then) {
                timeout.then(() => {
                    xhr.abort();
                });
            } else if (timeout > 0) {
                timeoutId = setTimeout(() => {
                    xhr.abort();
                }, timeout);
            }
        }
    }
}