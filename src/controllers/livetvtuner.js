define(['globalize', 'loading', 'libraryMenu', 'dom', 'emby-input', 'emby-button', 'emby-checkbox', 'emby-select'], function (globalize, loading, libraryMenu, dom) {
    'use strict';

    function isM3uVariant(type) {
        return ['nextpvr'].indexOf(type || '') !== -1;
    }

    function fillTypes(view, currentId) {
        return ApiClient.getJSON(ApiClient.getUrl('LiveTv/TunerHosts/Types')).then(function (types) {
            const selectType = view.querySelector('.selectType');
            let html = '';
            html += types.map(function (tuner) {
                return '<option value="' + tuner.Id + '">' + tuner.Name + '</option>';
            }).join('');
            html += '<option value="other">';
            html += globalize.translate('TabOther');
            html += '</option>';
            selectType.innerHTML = html;
            selectType.disabled = null != currentId;
            selectType.value = '';
            onTypeChange.call(selectType);
        });
    }

    function reload(view, providerId) {
        view.querySelector('.txtDevicePath').value = '';
        view.querySelector('.chkFavorite').checked = false;
        view.querySelector('.txtDevicePath').value = '';

        if (providerId) {
            ApiClient.getNamedConfiguration('livetv').then(function (config) {
                const info = config.TunerHosts.filter(function (i) {
                    return i.Id === providerId;
                })[0];
                fillTunerHostInfo(view, info);
            });
        }
    }

    function fillTunerHostInfo(view, info) {
        const selectType = view.querySelector('.selectType');
        let type = info.Type || '';

        if (info.Source && isM3uVariant(info.Source)) {
            type = info.Source;
        }

        selectType.value = type;
        onTypeChange.call(selectType);
        view.querySelector('.txtDevicePath').value = info.Url || '';
        view.querySelector('.txtFriendlyName').value = info.FriendlyName || '';
        view.querySelector('.txtUserAgent').value = info.UserAgent || '';
        view.querySelector('.fldDeviceId').value = info.DeviceId || '';
        view.querySelector('.chkFavorite').checked = info.ImportFavoritesOnly;
        view.querySelector('.chkTranscode').checked = info.AllowHWTranscoding;
        view.querySelector('.chkStreamLoop').checked = info.EnableStreamLooping;
        view.querySelector('.txtTunerCount').value = info.TunerCount || '0';
    }

    function submitForm(page) {
        loading.show();
        const info = {
            Type: page.querySelector('.selectType').value,
            Url: page.querySelector('.txtDevicePath').value || null,
            UserAgent: page.querySelector('.txtUserAgent').value || null,
            FriendlyName: page.querySelector('.txtFriendlyName').value || null,
            DeviceId: page.querySelector('.fldDeviceId').value || null,
            TunerCount: page.querySelector('.txtTunerCount').value || 0,
            ImportFavoritesOnly: page.querySelector('.chkFavorite').checked,
            AllowHWTranscoding: page.querySelector('.chkTranscode').checked,
            EnableStreamLooping: page.querySelector('.chkStreamLoop').checked
        };

        if (isM3uVariant(info.Type)) {
            info.Source = info.Type;
            info.Type = 'm3u';
        }

        const id = getParameterByName('id');

        if (id) {
            info.Id = id;
        }

        ApiClient.ajax({
            type: 'POST',
            url: ApiClient.getUrl('LiveTv/TunerHosts'),
            data: JSON.stringify(info),
            contentType: 'application/json'
        }).then(function (result) {
            Dashboard.processServerConfigurationUpdateResult();
            Dashboard.navigate('livetvstatus.html');
        }, function () {
            loading.hide();
            Dashboard.alert({
                message: globalize.translate('ErrorSavingTvProvider')
            });
        });
    }

    function getRequirePromise(deps) {
        return new Promise(function (resolve, reject) {
            require(deps, resolve);
        });
    }

    function getDetectedDevice() {
        return getRequirePromise(['tunerPicker']).then(function (tunerPicker) {
            return new tunerPicker().show({
                serverId: ApiClient.serverId()
            });
        });
    }

    function onTypeChange() {
        const value = this.value;
        const view = dom.parentWithClass(this, 'page');
        const mayIncludeUnsupportedDrmChannels = 'hdhomerun' === value;
        const supportsTranscoding = 'hdhomerun' === value;
        const supportsFavorites = 'hdhomerun' === value;
        const supportsTunerIpAddress = 'hdhomerun' === value;
        const supportsTunerFileOrUrl = 'm3u' === value;
        const supportsStreamLooping = 'm3u' === value;
        const supportsTunerCount = 'm3u' === value;
        const supportsUserAgent = 'm3u' === value;
        const suppportsSubmit = 'other' !== value;
        const supportsSelectablePath = supportsTunerFileOrUrl;
        const txtDevicePath = view.querySelector('.txtDevicePath');

        if (supportsTunerIpAddress) {
            txtDevicePath.label(globalize.translate('LabelTunerIpAddress'));
            view.querySelector('.fldPath').classList.remove('hide');
        } else if (supportsTunerFileOrUrl) {
            txtDevicePath.label(globalize.translate('LabelFileOrUrl'));
            view.querySelector('.fldPath').classList.remove('hide');
        } else {
            view.querySelector('.fldPath').classList.add('hide');
        }

        if (supportsSelectablePath) {
            view.querySelector('.btnSelectPath').classList.remove('hide');
            view.querySelector('.txtDevicePath').setAttribute('required', 'required');
        } else {
            view.querySelector('.btnSelectPath').classList.add('hide');
            view.querySelector('.txtDevicePath').removeAttribute('required');
        }

        if (supportsUserAgent) {
            view.querySelector('.fldUserAgent').classList.remove('hide');
        } else {
            view.querySelector('.fldUserAgent').classList.add('hide');
        }

        if (supportsFavorites) {
            view.querySelector('.fldFavorites').classList.remove('hide');
        } else {
            view.querySelector('.fldFavorites').classList.add('hide');
        }

        if (supportsTranscoding) {
            view.querySelector('.fldTranscode').classList.remove('hide');
        } else {
            view.querySelector('.fldTranscode').classList.add('hide');
        }

        if (supportsStreamLooping) {
            view.querySelector('.fldStreamLoop').classList.remove('hide');
        } else {
            view.querySelector('.fldStreamLoop').classList.add('hide');
        }

        if (supportsTunerCount) {
            view.querySelector('.fldTunerCount').classList.remove('hide');
            view.querySelector('.txtTunerCount').setAttribute('required', 'required');
        } else {
            view.querySelector('.fldTunerCount').classList.add('hide');
            view.querySelector('.txtTunerCount').removeAttribute('required');
        }

        if (mayIncludeUnsupportedDrmChannels) {
            view.querySelector('.drmMessage').classList.remove('hide');
        } else {
            view.querySelector('.drmMessage').classList.add('hide');
        }

        if (suppportsSubmit) {
            view.querySelector('.button-submit').classList.remove('hide');
        } else {
            view.querySelector('.button-submit').classList.add('hide');
        }
    }

    return function (view, params) {
        if (!params.id) {
            view.querySelector('.btnDetect').classList.remove('hide');
        }

        view.addEventListener('viewshow', function () {
            const currentId = params.id;
            fillTypes(view, currentId).then(function () {
                reload(view, currentId);
            });
        });
        view.querySelector('form').addEventListener('submit', function (e) {
            submitForm(view);
            e.preventDefault();
            e.stopPropagation();
            return false;
        });
        view.querySelector('.selectType').addEventListener('change', onTypeChange);
        view.querySelector('.btnDetect').addEventListener('click', function () {
            getDetectedDevice().then(function (info) {
                fillTunerHostInfo(view, info);
            });
        });
        view.querySelector('.btnSelectPath').addEventListener('click', function () {
            require(['directorybrowser'], function (directoryBrowser) {
                const picker = new directoryBrowser.default();
                picker.show({
                    includeFiles: true,
                    callback: function (path) {
                        if (path) {
                            view.querySelector('.txtDevicePath').value = path;
                        }

                        picker.close();
                    }
                });
            });
        });
    };
});
