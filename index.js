/**
 * @format
 */

import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import { Buffer } from 'buffer';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

if (global.Buffer == null) {
  // @ts-ignore
  global.Buffer = Buffer;
}

AppRegistry.registerComponent(appName, () => App);
