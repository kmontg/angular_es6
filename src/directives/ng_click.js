export default function ngClickDirective() {
    return {
        restrict: 'A',
        link: (scope, element, attrs) => {
            element.on('click', (evt) => {
                scope.$eval(attrs.ngClick, {$event: evt});
                scope.$apply();
            });
        }
    }
}