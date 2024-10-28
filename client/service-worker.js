// sw.js
import { registerRoute, Route } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';

// Handle images under /plugins/siyuan-drawio-plugin/webapp/:
const imageRoute = new Route(({ request }) => {
  return request.destination === 'image' && request.url.includes('/plugins/siyuan-drawio-plugin/webapp/');
}, new StaleWhileRevalidate({
  cacheName: 'images'
}));

// Handle scripts under /plugins/siyuan-drawio-plugin/webapp/:
const scriptsRoute = new Route(({ request }) => {
  return request.destination === 'script' && request.url.includes('/plugins/siyuan-drawio-plugin/webapp/');
}, new StaleWhileRevalidate({
  cacheName: 'scripts'
}));

// Handle styles under /plugins/siyuan-drawio-plugin/webapp/:
const stylesRoute = new Route(({ request }) => {
  return request.destination === 'style' && request.url.includes('/plugins/siyuan-drawio-plugin/webapp/');
}, new StaleWhileRevalidate({
  cacheName: 'styles'
}));

// Register routes
registerRoute(imageRoute);
registerRoute(scriptsRoute);
registerRoute(stylesRoute);