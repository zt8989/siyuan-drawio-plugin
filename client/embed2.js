window.DRAWIO_BASE_URL = "/plugins/siyuan-drawio-plugin/webapp"
window.PROXY_URL = window.DRAWIO_BASE_URL + "/proxy";
window.STYLE_PATH = window.DRAWIO_BASE_URL+ "/styles";
window.SHAPES_PATH = window.DRAWIO_BASE_URL+ "/shapes";
window.STENCIL_PATH = window.DRAWIO_BASE_URL + "/stencils";
window.DRAW_MATH_URL = window.DRAWIO_BASE_URL + "/math/es5";
window.GRAPH_IMAGE_PATH = window.DRAWIO_BASE_URL + "/img";
window.mxImageBasePath = window.DRAWIO_BASE_URL + "/mxgraph/images";
window.mxBasePath = window.DRAWIO_BASE_URL + "/mxgraph/";
window.onDrawioViewerLoad = function() {mxStencilRegistry.parseStencilSets([]);GraphViewer.processElements(); };
var t = document.getElementsByTagName('script');if (t != null && t.length > 0) {var script = document.createElement('script');script.type = 'text/javascript';script.src = window.DRAWIO_BASE_URL + '/js/viewer-static.min.js';t[0].parentNode.appendChild(script);}