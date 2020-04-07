const { Plugin } = require('powercord/entities');
const { React, i18n: { _proxyContext: { messages } }, getModule, getModuleByDisplayName } = require('powercord/webpack');
const { getOwnerInstance, waitFor } = require('powercord/util');
const { inject, uninject } = require('powercord/injector');

module.exports = class RequestBadgeRemover extends Plugin {
  constructor () {
    super();

    this.state = {};
  }

  async startPlugin () {
    this.stores = {
      notificationStore: await getModule([ 'getDisableUnreadBadge' ]),
      unreadStore: await getModule([ 'getTotalMentionCount' ]),
      friendStore: await getModule([ 'getPendingCount' ])
    };

    const sidebarClasses = await getModule([ 'sidebar', 'content' ]);
    const instance = getOwnerInstance(await waitFor(`.${sidebarClasses.guilds}`));

    const DefaultHomeButton = instance.scroller.props.children[0].props.render().type;
    inject('RequestBadgeRemover-DefaultHomeButton', DefaultHomeButton.prototype, 'render', (_, res) => {
      const oldValue = res.props.badge;

      if (this.settings.get('disableRequestBadges', false)) {
        res.props.badge = 0;
        this.debug('[DefaultHomeButton] [badge]:', { oldValue, newValue: res.props.badge });
      }

      return res;
    });

    const AppBadge = await getModuleByDisplayName('FluxContainer(AppBadge)');
    inject('RequestBadgeRemover-AppBadge', AppBadge.prototype, 'render', (_, res) => {
      const { friendStore } = this.stores;
      const oldValue = res.props.badge;

      if (this.settings.get('disableRequestBadges', false)) {
        res.props.badge -= friendStore.getPendingCount();
        this.debug('[AppBadge] [badge]:', { oldValue, newValue: res.props.badge });
      }

      return res;
    });

    const AppTray = await getModuleByDisplayName('FluxContainer(AppTray)');
    inject('RequestBadgeRemover-AppTray', AppTray.prototype, 'render', (_, res) => {
      const { notificationStore, unreadStore } = this.stores;
      const oldValue = res.props.unread;

      const disableUnreadBadge = notificationStore.getDisableUnreadBadge();
      const totalMentions = unreadStore.getTotalMentionCount();
      const pendingUnreads = unreadStore.hasAnyUnread();

      if (this.settings.get('disableRequestBadges', false)) {
        res.props.unread = !disableUnreadBadge && !!(pendingUnreads || totalMentions > 0);
        this.debug('[AppTray] [unread]:', { oldValue, newValue: res.props.unread });
      }

      return res;
    });

    const _this = this;
    const FluxUserSettingsNotifications = await getModuleByDisplayName('FluxContainer(UserSettingsNotifications)');
    const UserSettingsNotifications = (new FluxUserSettingsNotifications()).render().type;
    inject('RequestBadgeRemover-UserSettingsNotifications', UserSettingsNotifications.prototype, 'render', function (_, res) {
      const { children } = res.props;
      const enableUnreadMessageBadge = children.find(child => child.props && child.props.children === messages.USER_SETTINGS_NOTIFICATIONS_SHOW_BADGE_LABEL);

      children.splice(children.indexOf(enableUnreadMessageBadge) + 1, 0,
        Object.assign({}, res.props.children[0], {
          props: Object.assign({}, res.props.children[0].props, {
            children: [
              'Enable Friend Request Badge',
              React.createElement('div', {
                className: 'badge-_BgAUQ',
                style: { display: 'inline', marginLeft: '5px' }
              }, 'new')
            ],
            note: 'Shows a red badge on the app icon and home button when you have pending friend requests.',
            onChange: (e) => {
              _this.setDisableRequestBadges(!e.currentTarget.checked);
              this._reactInternalFiber.stateNode.forceUpdate();
            },
            value: !_this.settings.get('disableRequestBadges', false)
          })
        })
      );

      return res;
    });

    this.state.instance = instance;
  }

  pluginWillUnload () {
    uninject('RequestBadgeRemover-DefaultHomeButton');
    uninject('RequestBadgeRemover-AppBadge');
    uninject('RequestBadgeRemover-AppTray');
    uninject('RequestBadgeRemover-UserSettingsNotifications');
  }

  setDisableRequestBadges (value) {
    this.settings.set('disableRequestBadges', value);

    const { instance } = this.state;
    instance.forceUpdate();

    const components = [ 'AppBadge', 'AppTray' ];
    for (const component of components) {
      const Component = getModuleByDisplayName(`FluxContainer(${component})`, false);
      (new Component()).render();
    }
  }
};
