define(['datetime'], function (datetime) {
    'use strict';

    function humaneDate (dateString) {
        var format;
        var timeFormats = [
            [90, 'a minute'],
            [3600, 'minutes', 60],
            [5400, 'an hour'],
            [86400, 'hours', 3600],
            [129600, 'a day'],
            [604800, 'days', 86400],
            [907200, 'a week'],
            [2628e3, 'weeks', 604800],
            [3942e3, 'a month'],
            [31536e3, 'months', 2628e3],
            [47304e3, 'a year'],
            [31536e5, 'years', 31536e3]
        ];
        var dt = new Date();
        var date = datetime.parseISO8601Date(dateString, true);
        var seconds = (dt - date) / 1000.0;
        var i = 0;

        if (seconds < 0) {
            seconds = Math.abs(seconds);
        }

        timeFormats.forEach(function (format) {
            if (seconds < format[0]) {
                if (format.length === 2) {
                    return format[1] + ' ago';
                }

                return Math.round(seconds / format[2]) + ' ' + format[1] + ' ago';
            }
        })

        if (seconds > 47304e5) {
            return Math.round(seconds / 47304e5) + ' centuries ago';
        }

        return dateString;
    }

    function humaneElapsed (firstDateStr, secondDateStr) {
        // TODO replace this whole script with a library or something
        var dateOne = new Date(firstDateStr);
        var dateTwo = new Date(secondDateStr);
        var delta = (dateTwo.getTime() - dateOne.getTime()) / 1e3;
        var days = Math.floor(delta % 31536e3 / 86400);
        var hours = Math.floor(delta % 31536e3 % 86400 / 3600);
        var minutes = Math.floor(delta % 31536e3 % 86400 % 3600 / 60);
        var seconds = Math.round(delta % 31536e3 % 86400 % 3600 % 60);
        var elapsed = '';
        elapsed += days === 1 ? days + ' day ' : '';
        elapsed += days > 1 ? days + ' days ' : '';
        elapsed += hours === 1 ? hours + ' hour ' : '';
        elapsed += hours > 1 ? hours + ' hours ' : '';
        elapsed += minutes === 1 ? minutes + ' minute ' : '';
        elapsed += minutes > 1 ? minutes + ' minutes ' : '';
        elapsed += elapsed.length > 0 ? 'and ' : '';
        elapsed += seconds === 1 ? seconds + ' second' : '';
        elapsed += seconds === 0 || seconds > 1 ? seconds + ' seconds' : '';
        return elapsed;
    }

    window.humaneDate = humaneDate;
    window.humaneElapsed = humaneElapsed;
    return {
        humaneDate: humaneDate,
        humaneElapsed: humaneElapsed
    };
});
