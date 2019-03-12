# haraka-plugin-pg-limit

pg-limit plugin enhancement. Add ability to store **rate_rcpt_sender** limits in a per-user postgresql database.

You can specify many comma separated limits. For example,

```
1/5s,1000/1d
``` 

will allow only 1 mail per 5s, *and* only 1000 mails per day

This plugin is meant to be used with haraka-plugin-pg-profile. It will use pg-profile configuration and
database.

All other limits respect haraka-plugin-limit specs.