/* eslint-disable no-trailing-spaces */
'use strict';

/* global server */

exports.register = function () {

    this.inherits('limit');

};

exports.load_limit_ini = function () {
    const plugin = this;
    plugin.cfg = plugin.config.get('limit.ini', {
        booleans: [
            '-outbound.enabled',
            '-recipients.enabled',
            '-unrecognized_commands.enabled',
            '-errors.enabled',
            '-rate_conn.enabled',
            '-rate_rcpt.enabled',
            '-rate_rcpt_host.enabled',
            '-rate_rcpt_sender.enabled',
            '-rate_rcpt_null.enabled',
        ]
    },
    function () {
        plugin.load_limit_ini();
    });

    if (!plugin.cfg.concurrency) {   // no config file
        plugin.cfg.concurrency = {};
    }

    plugin.merge_redis_ini();
};

exports.rate_rcpt_sender = async function (next, connection, params) {
    const plugin = this;
    const pg_profile_plugin = server.plugins.registered_plugins['pg-profile'];

    const token = connection.notes.auth_user === 'token';
    const auth_user = token ? connection.notes.jwt_mail : connection.notes.auth_user;
    if (!token) {
        if (!connection.notes.auth_user || !pg_profile_plugin.users.hasOwnProperty(auth_user) || !pg_profile_plugin.users[auth_user]) {
            connection.loginfo("No authenticated user found => no rate check");
            next();
            return;
        }
    }

    const user = token ? null : pg_profile_plugin.users[auth_user];
    const profile = pg_profile_plugin.profiles[token ? 'token' : "p-"+user.profileId ];

    if (!profile) {
        connection.loginfo(`No profile found for user ${auth_user} => no rate check`);
        next();
        return;
    }

    connection.loginfo(`User "${auth_user}" has limits "${profile.limits.join(',')}"`);


    const rate_limit_async = (connection, key, value) => {
        return new Promise( (resolve, reject) => {
            plugin.rate_limit(connection, key, value, (err, over) => {
                if (err) reject(err);
                connection.results.add(plugin, {rate_rcpt_sender: value});
                if (over) {
                    connection.logerror(`LIMIT EXCEEDED : ${key} ${value}`);
                }
                resolve(over);
            })
        })
    };

    const key = `@@${auth_user}@@`;
    connection.loginfo(`rate check for ${key}`);

    Promise.all(profile.limits.map(value => {

        connection.loginfo(`check rate_rcpt_sender for user ${key} with value ${value}`);

        return rate_limit_async(connection, 'rate_rcpt_sender' + value + ':' + key, value);

    })).then(values => {

        if (values.indexOf(true) === -1) {
            connection.loginfo(`All rate_rcpt_sender OK for user ${key}`);
            return next();
        } else {
            connection.results.add(plugin, {fail: 'rate_rcpt_sender'});
            plugin.penalize(connection, false, 'rcpt rate limit exceeded', next);
            connection.logerror('LIMIT EXCEEDED');
        }
    });

    return false;

};

