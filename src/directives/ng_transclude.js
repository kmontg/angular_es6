export default function ngTranscludeDirective() {
    return {
        restrict: 'EAC',
        link: function(scope, element, attrs, ctrl, transclude) {
            transclude(function(clone) {
                element.empty();
                element.append(clone);
            });
        }
    };
};