cordova-alljoyn-introspector
===========================

A utility Cordova application that uses the [Cordova AllJoyn plugin](https://github.com/AllJoyn-Cordova/cordova-plugin-alljoyn) to perform DBus introspection against devices found on the network. Devices are found via About Announcement.

This app is in development.

The app requires an AllJoyn router to be on the local network. For every device on the network found the app attempts to join a session with the device. If successful a button is added to the UI that will initiate introspection against it. Introspection happens recursively on the object path starting with the root object '/'. The resulting output is 

## To Run
```sh
$ git clone https://github.com/obsoleted/cordova-alljoyn-introspector.git
$ cd cordova-alljoyn-introspector
$ cordova plugin add org.allseen.alljoyn
$ cordova plugin add org.apache.cordova.console
$ cordova platform add ios
$ cordova run ios
```

## Next Steps
- Provide in app view of introspection data
- Show more useful device info from about announcement (pending on support from plugin)
- Improved error handling.