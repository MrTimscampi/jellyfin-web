define(['loading', 'globalize', 'events', 'viewManager', 'skinManager', 'backdrop', 'browser', 'page', 'appSettings', 'apphost', 'connectionManager'], function (loading, globalize, events, viewManager, skinManager, backdrop, browser, page, appSettings, appHost, connectionManager) {
    'use strict';

    const appRouter = {
        showLocalLogin: function (serverId, manualLogin) {
            const pageName = manualLogin ? 'manuallogin' : 'login';
            show('/startup/' + pageName + '.html?serverid=' + serverId);
        },
        showSelectServer: function () {
            show('/startup/selectserver.html');
        },
        showWelcome: function () {
            show('/startup/welcome.html');
        },
        showSettings: function () {
            show('/settings/settings.html');
        },
        showNowPlaying: function () {
            show('queue');
        }
    };

    function beginConnectionWizard() {
        backdrop.clearBackdrop();
        loading.show();
        connectionManager.connect({
            enableAutoLogin: appSettings.enableAutoLogin()
        }).then(function (result) {
            handleConnectionResult(result);
        });
    }

    function handleConnectionResult(result) {
        switch (result.State) {
            case 'SignedIn':
                loading.hide();
                skinManager.loadUserSkin();
                break;
            case 'ServerSignIn':
                result.ApiClient.getPublicUsers().then(function (users) {
                    if (users.length) {
                        appRouter.showLocalLogin(result.Servers[0].Id);
                    } else {
                        appRouter.showLocalLogin(result.Servers[0].Id, true);
                    }
                });
                break;
            case 'ServerSelection':
                appRouter.showSelectServer();
                break;
            case 'ConnectSignIn':
                appRouter.showWelcome();
                break;
            case 'ServerUpdateNeeded':
                require(['alert'], function (alert) {
                    alert.default({
                        text: globalize.translate('ServerUpdateNeeded', 'https://github.com/jellyfin/jellyfin'),
                        html: globalize.translate('ServerUpdateNeeded', '<a href="https://github.com/jellyfin/jellyfin">https://github.com/jellyfin/jellyfin</a>')
                    }).then(function () {
                        appRouter.showSelectServer();
                    });
                });
                break;
            default:
                break;
        }
    }

    function loadContentUrl(ctx, next, route, request) {
        let url;
        if (route.contentPath && typeof (route.contentPath) === 'function') {
            url = route.contentPath(ctx.querystring);
        } else {
            url = route.contentPath || route.path;
        }

        if (url.indexOf('://') === -1) {
            // Put a slash at the beginning but make sure to avoid a double slash
            if (url.indexOf('/') !== 0) {
                url = '/' + url;
            }

            url = baseUrl() + url;
        }

        if (ctx.querystring && route.enableContentQueryString) {
            url += '?' + ctx.querystring;
        }

        require(['text!' + url], function (html) {
            loadContent(ctx, route, html, request);
        });
    }

    function handleRoute(ctx, next, route) {
        authenticate(ctx, route, function () {
            initRoute(ctx, next, route);
        });
    }

    function initRoute(ctx, next, route) {
        const onInitComplete = function (controllerFactory) {
            sendRouteToViewManager(ctx, next, route, controllerFactory);
        };

        if (route.controller) {
            require(['controllers/' + route.controller], onInitComplete);
        } else {
            onInitComplete();
        }
    }

    function cancelCurrentLoadRequest() {
        const currentRequest = currentViewLoadRequest;
        if (currentRequest) {
            currentRequest.cancel = true;
        }
    }

    let currentViewLoadRequest;
    function sendRouteToViewManager(ctx, next, route, controllerFactory) {
        if (isDummyBackToHome && route.type === 'home') {
            isDummyBackToHome = false;
            return;
        }

        cancelCurrentLoadRequest();
        const isBackNav = ctx.isBack;

        const currentRequest = {
            url: baseUrl() + ctx.path,
            transition: route.transition,
            isBack: isBackNav,
            state: ctx.state,
            type: route.type,
            fullscreen: route.fullscreen,
            controllerFactory: controllerFactory,
            options: {
                supportsThemeMedia: route.supportsThemeMedia || false,
                enableMediaControl: route.enableMediaControl !== false
            },
            autoFocus: route.autoFocus
        };
        currentViewLoadRequest = currentRequest;

        const onNewViewNeeded = function () {
            if (typeof route.path === 'string') {
                loadContentUrl(ctx, next, route, currentRequest);
            } else {
                // ? TODO
                next();
            }
        };

        if (!isBackNav) {
            onNewViewNeeded();
            return;
        }
        viewManager.tryRestoreView(currentRequest, function () {
            currentRouteInfo = {
                route: route,
                path: ctx.path
            };
        }).catch(function (result) {
            if (!result || !result.cancelled) {
                onNewViewNeeded();
            }
        });
    }

    let msgTimeout;
    let forcedLogoutMsg;
    function onForcedLogoutMessageTimeout() {
        const msg = forcedLogoutMsg;
        forcedLogoutMsg = null;

        if (msg) {
            require(['alert'], function (alert) {
                alert(msg);
            });
        }
    }

    function showForcedLogoutMessage(msg) {
        forcedLogoutMsg = msg;
        if (msgTimeout) {
            clearTimeout(msgTimeout);
        }

        msgTimeout = setTimeout(onForcedLogoutMessageTimeout, 100);
    }

    function onRequestFail(e, data) {
        const apiClient = this;

        if (data.status === 403) {
            if (data.errorCode === 'ParentalControl') {
                const isCurrentAllowed = currentRouteInfo ? (currentRouteInfo.route.anonymous || currentRouteInfo.route.startup) : true;

                // Bounce to the login screen, but not if a password entry fails, obviously
                if (!isCurrentAllowed) {
                    showForcedLogoutMessage(globalize.translate('AccessRestrictedTryAgainLater'));
                    appRouter.showLocalLogin(apiClient.serverId());
                }
            }
        }
    }

    function onBeforeExit(e) {
        if (browser.web0s) {
            page.restorePreviousState();
        }
    }

    function normalizeImageOptions(options) {
        let setQuality;
        if (options.maxWidth || options.width || options.maxHeight || options.height) {
            setQuality = true;
        }

        if (setQuality && !options.quality) {
            options.quality = 90;
        }
    }

    function getMaxBandwidth() {
        /* eslint-disable compat/compat */
        if (navigator.connection) {
            let max = navigator.connection.downlinkMax;
            if (max && max > 0 && max < Number.POSITIVE_INFINITY) {
                max /= 8;
                max *= 1000000;
                max *= 0.7;
                max = parseInt(max);
                return max;
            }
        }
        /* eslint-enable compat/compat */

        return null;
    }

    function getMaxBandwidthIOS() {
        return 800000;
    }

    function onApiClientCreated(e, newApiClient) {
        newApiClient.normalizeImageOptions = normalizeImageOptions;

        if (browser.iOS) {
            newApiClient.getMaxBandwidth = getMaxBandwidthIOS;
        } else {
            newApiClient.getMaxBandwidth = getMaxBandwidth;
        }

        events.off(newApiClient, 'requestfail', onRequestFail);
        events.on(newApiClient, 'requestfail', onRequestFail);
    }

    function initApiClient(apiClient) {
        onApiClientCreated({}, apiClient);
    }

    function initApiClients() {
        connectionManager.getApiClients().forEach(initApiClient);

        events.on(connectionManager, 'apiclientcreated', onApiClientCreated);
    }

    function onAppResume() {
        const apiClient = connectionManager.currentApiClient();

        if (apiClient) {
            apiClient.ensureWebSocket();
        }
    }

    let firstConnectionResult;
    function start(options) {
        loading.show();

        initApiClients();

        events.on(appHost, 'beforeexit', onBeforeExit);
        events.on(appHost, 'resume', onAppResume);

        connectionManager.connect({
            enableAutoLogin: appSettings.enableAutoLogin()

        }).then(function (result) {
            firstConnectionResult = result;

            options = options || {};

            page({
                click: options.click !== false,
                hashbang: options.hashbang !== false
            });
        }).catch().then(function() {
            loading.hide();
        });
    }

    function enableNativeHistory() {
        return false;
    }

    function authenticate(ctx, route, callback) {
        const firstResult = firstConnectionResult;
        if (firstResult) {
            firstConnectionResult = null;

            if (firstResult.State !== 'SignedIn' && !route.anonymous) {
                handleConnectionResult(firstResult);
                return;
            }
        }

        const apiClient = connectionManager.currentApiClient();
        const pathname = ctx.pathname.toLowerCase();

        console.debug('appRouter - processing path request ' + pathname);

        const isCurrentRouteStartup = currentRouteInfo ? currentRouteInfo.route.startup : true;
        const shouldExitApp = ctx.isBack && route.isDefaultRoute && isCurrentRouteStartup;

        if (!shouldExitApp && (!apiClient || !apiClient.isLoggedIn()) && !route.anonymous) {
            console.debug('appRouter - route does not allow anonymous access, redirecting to login');
            beginConnectionWizard();
            return;
        }

        if (shouldExitApp) {
            if (appHost.supports('exit')) {
                appHost.exit();
                return;
            }
            return;
        }

        if (apiClient && apiClient.isLoggedIn()) {
            console.debug('appRouter - user is authenticated');

            if (route.isDefaultRoute) {
                console.debug('appRouter - loading skin home page');
                loadUserSkinWithOptions(ctx);
                return;
            } else if (route.roles) {
                validateRoles(apiClient, route.roles).then(function () {
                    callback();
                }, beginConnectionWizard);
                return;
            }
        }

        console.debug('appRouter - proceeding to ' + pathname);
        callback();
    }

    function loadUserSkinWithOptions(ctx) {
        require(['queryString'], function (queryString) {
            const params = queryString.parse(ctx.querystring);
            skinManager.loadUserSkin({
                start: params.start
            });
        });
    }

    function validateRoles(apiClient, roles) {
        return Promise.all(roles.split(',').map(function (role) {
            return validateRole(apiClient, role);
        }));
    }

    function validateRole(apiClient, role) {
        if (role === 'admin') {
            return apiClient.getCurrentUser().then(function (user) {
                if (user.Policy.IsAdministrator) {
                    return Promise.resolve();
                }
                return Promise.reject();
            });
        }

        // Unknown role
        return Promise.resolve();
    }

    let isDummyBackToHome;

    function loadContent(ctx, route, html, request) {
        html = globalize.translateHtml(html, route.dictionary);
        request.view = html;

        viewManager.loadView(request);

        currentRouteInfo = {
            route: route,
            path: ctx.path
        };

        ctx.handled = true;
    }

    function getRequestFile() {
        let path = self.location.pathname || '';

        const index = path.lastIndexOf('/');
        if (index !== -1) {
            path = path.substring(index);
        } else {
            path = '/' + path;
        }

        if (!path || path === '/') {
            path = '/index.html';
        }

        return path;
    }

    function endsWith(str, srch) {
        return str.lastIndexOf(srch) === srch.length - 1;
    }

    let baseRoute = self.location.href.split('?')[0].replace(getRequestFile(), '');
    // support hashbang
    baseRoute = baseRoute.split('#')[0];
    if (endsWith(baseRoute, '/') && !endsWith(baseRoute, '://')) {
        baseRoute = baseRoute.substring(0, baseRoute.length - 1);
    }

    function baseUrl() {
        return baseRoute;
    }

    let popstateOccurred = false;
    window.addEventListener('popstate', function () {
        popstateOccurred = true;
    });

    function getHandler(route) {
        return function (ctx, next) {
            ctx.isBack = popstateOccurred;
            handleRoute(ctx, next, route);
            popstateOccurred = false;
        };
    }

    function getWindowLocationSearch(win) {
        const currentPath = currentRouteInfo ? (currentRouteInfo.path || '') : '';

        const index = currentPath.indexOf('?');
        let search = '';

        if (index !== -1) {
            search = currentPath.substring(index);
        }

        return search || '';
    }

    function param(name, url) {
        name = name.replace(/[\[]/, '\\\[').replace(/[\]]/, '\\\]');
        const regexS = '[\\?&]' + name + '=([^&#]*)';
        const regex = new RegExp(regexS, 'i');

        const results = regex.exec(url || getWindowLocationSearch());
        if (results == null) {
            return '';
        } else {
            return decodeURIComponent(results[1].replace(/\+/g, ' '));
        }
    }

    function back() {
        page.back();
    }

    /**
     * Pages of "no return" (when "Go back" should behave differently, probably quitting the application).
     */
    const startPages = ['home', 'login', 'selectserver'];

    function canGoBack() {
        const curr = current();
        if (!curr) {
            return false;
        }

        if (!document.querySelector('.dialogContainer') && startPages.indexOf(curr.type) !== -1) {
            return false;
        }

        return (page.len || 0) > 0;
    }

    function showDirect(path) {
        return new Promise(function(resolve, reject) {
            resolveOnNextShow = resolve;
            page.show(baseUrl() + path);
        });
    }

    function show(path, options) {
        if (path.indexOf('/') !== 0 && path.indexOf('://') === -1) {
            path = '/' + path;
        }

        path = path.replace(baseUrl(), '');

        if (currentRouteInfo && currentRouteInfo.path === path) {
            // can't use this with home right now due to the back menu
            if (currentRouteInfo.route.type !== 'home') {
                loading.hide();
                return Promise.resolve();
            }
        }

        return new Promise(function (resolve, reject) {
            resolveOnNextShow = resolve;
            page.show(path, options);
        });
    }

    let resolveOnNextShow;
    document.addEventListener('viewshow', function () {
        const resolve = resolveOnNextShow;
        if (resolve) {
            resolveOnNextShow = null;
            resolve();
        }
    });

    let currentRouteInfo;
    function current() {
        return currentRouteInfo ? currentRouteInfo.route : null;
    }

    function showItem(item, serverId, options) {
        // TODO: Refactor this so it only gets items, not strings.
        if (typeof (item) === 'string') {
            const apiClient = serverId ? connectionManager.getApiClient(serverId) : connectionManager.currentApiClient();
            apiClient.getItem(apiClient.getCurrentUserId(), item).then(function (itemObject) {
                appRouter.showItem(itemObject, options);
            });
        } else {
            if (arguments.length === 2) {
                options = arguments[1];
            }

            const url = appRouter.getRouteUrl(item, options);
            appRouter.show(url, {
                item: item
            });
        }
    }

    const allRoutes = [];

    function addRoute(path, newRoute) {
        page(path, getHandler(newRoute));
        allRoutes.push(newRoute);
    }

    function getRoutes() {
        return allRoutes;
    }

    let backdropContainer;
    let backgroundContainer;
    function setTransparency(level) {
        if (!backdropContainer) {
            backdropContainer = document.querySelector('.backdropContainer');
        }
        if (!backgroundContainer) {
            backgroundContainer = document.querySelector('.backgroundContainer');
        }

        if (level === 'full' || level === 2) {
            backdrop.clearBackdrop(true);
            document.documentElement.classList.add('transparentDocument');
            backgroundContainer.classList.add('backgroundContainer-transparent');
            backdropContainer.classList.add('hide');
        } else if (level === 'backdrop' || level === 1) {
            backdrop.externalBackdrop(true);
            document.documentElement.classList.add('transparentDocument');
            backgroundContainer.classList.add('backgroundContainer-transparent');
            backdropContainer.classList.add('hide');
        } else {
            backdrop.externalBackdrop(false);
            document.documentElement.classList.remove('transparentDocument');
            backgroundContainer.classList.remove('backgroundContainer-transparent');
            backdropContainer.classList.remove('hide');
        }
    }

    function pushState(state, title, url) {
        state.navigate = false;
        history.pushState(state, title, url);
    }

    function setBaseRoute() {
        let baseRoute = self.location.pathname.replace(getRequestFile(), '');
        if (baseRoute.lastIndexOf('/') === baseRoute.length - 1) {
            baseRoute = baseRoute.substring(0, baseRoute.length - 1);
        }

        console.debug('setting page base to ' + baseRoute);
        page.base(baseRoute);
    }

    setBaseRoute();

    function invokeShortcut(id) {
        if (id.indexOf('library-') === 0) {
            id = id.replace('library-', '');
            id = id.split('_');

            appRouter.showItem(id[0], id[1]);
        } else if (id.indexOf('item-') === 0) {
            id = id.replace('item-', '');
            id = id.split('_');

            appRouter.showItem(id[0], id[1]);
        } else {
            id = id.split('_');
            appRouter.show(appRouter.getRouteUrl(id[0], {
                serverId: id[1]
            }));
        }
    }

    appRouter.addRoute = addRoute;
    appRouter.param = param;
    appRouter.back = back;
    appRouter.show = show;
    appRouter.showDirect = showDirect;
    appRouter.start = start;
    appRouter.baseUrl = baseUrl;
    appRouter.canGoBack = canGoBack;
    appRouter.current = current;
    appRouter.beginConnectionWizard = beginConnectionWizard;
    appRouter.invokeShortcut = invokeShortcut;
    appRouter.showItem = showItem;
    appRouter.setTransparency = setTransparency;
    appRouter.getRoutes = getRoutes;
    appRouter.pushState = pushState;
    appRouter.enableNativeHistory = enableNativeHistory;
    appRouter.handleAnchorClick = page.clickHandler;
    appRouter.TransparencyLevel = {
        None: 0,
        Backdrop: 1,
        Full: 2
    };

    return appRouter;
});
