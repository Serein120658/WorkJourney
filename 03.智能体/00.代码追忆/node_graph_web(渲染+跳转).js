/**
 * 作者：gongxi
 * 时间：2025-09-11
 * 智能体节点图表 - G6内嵌iframe HTML渲染方案 - 优化版
 * 统一节点类型，优化iframe渲染和交互
 */

require.config({
    paths: {
        jquery: '../../sys/jquery',
        system: '../../sys/system',
        layui: "../../layui-btkj/layui",
        layuicommon: "../../sys/layuicommon",
        g6: "../../plugin/antv/g6/g6.min"  // 使用G6 v4
    },
    shim: {
        "system": {
            deps: ["jquery"]
        },
        "layui": {
            deps: ["jquery", "system"]
        },
        "layuicommon": {
            deps: ["jquery", "layui"]
        },
        "g6": {
            deps: ["jquery"]
        }
    },
    waitSeconds: 0
});

// 全局数据对象
objdata = {
    agent_id: null,
    allNodeData: [],
    nodeRelationDataHTML: null,
    currentGraph: null,
    isLoading: false,
    isInitialized: false,
    isDragging: false,
    dragStartTime: 0,
    clickedNodes: new Set(),
    applicable: {
        applicable_end: '',
        applicable_role: ''
    },
    pointType: '',
    // HTML节点iframe容器管理
    htmlIframes: new Map(),
    // 防止重复创建iframe的标记
    createdIframes: new Set()
};

// 插件类型配置
const PLUGIN_TYPES = {
    superlink: {
        name: '超链接',
        bgColor: '#e6f7ff',
        borderColor: '#1890ff',
        textColor: '#1890ff',
        rendering: 'canvas'
    },
    http: {
        name: 'HTTP请求',
        bgColor: '#fff7e6',
        borderColor: '#fa8c16',
        textColor: '#fa8c16',
        rendering: 'canvas'
    },
    code: {
        name: '代码执行',
        bgColor: '#f6ffed',
        borderColor: '#52c41a',
        textColor: '#52c41a',
        rendering: 'html'   // code类型支持HTML渲染
    },
    function: {
        name: '函数调用',
        bgColor: '#f9f0ff',
        borderColor: '#722ed1',
        textColor: '#722ed1',
        rendering: 'canvas'
    },
    default: {
        name: '默认内容',
        bgColor: 'transparent',
        borderColor: 'transparent',
        textColor: '#666',
        rendering: 'canvas'
    }
};

// 节点样式配置
const NODE_STYLE_CONFIG = {
    size: {
        H5: [180, 140],
        web: [220, 180]
    },
    titleHeight: {
        H5: 25,
        web: 30
    },
    fontSize: {
        title: {
            H5: 10,
            web: 12
        },
        content: {
            H5: 9,
            web: 11
        },
        date: {
            H5: 10,
            web: 10
        },
        count: {
            H5: 10,
            web: 10
        },
        mainNumber: {
            H5: 16,
            web: 16
        },
        subLabel: {
            H5: 12,
            web: 12
        },
        lockIcon: {
            H5: 20,
            web: 26
        }
    },
    colors: {
        nodeBackground: '#fff',
        nodeBackgroundDisabled: '#f5f5f5',
        nodeBorder: '#818181',
        nodeBorderDisabled: '#e8e8e8',
        nodeBorderSelected: '#1890ff',
        shadowDefault: 'rgba(24, 144, 255, 0.6)',
        shadowClicked: 'rgba(82, 196, 26, 0.8)',
        titleText: '#0a0a0a',
        titleTextDisabled: '#999',
        dateText: '#333',
        dateTextDisabled: '#999',
        contentText: '#565555',
        contentTextDisabled: '#999',
        countNumber: '#ee1212',
        countNumberDisabled: '#999',
        percentageText: '#333',
        percentageTextDisabled: '#999',
        subLabelText: '#666',
        subLabelTextDisabled: '#999',
        titleBorder: '#e1e1e1',
        htmlPreviewBorder: '#52c41a',
        htmlPreviewBorderDisabled: '#d9d9d9',
        htmlPreviewBackground: '#fff',
        htmlPreviewBackgroundDisabled: '#f5f5f5'
    },
    layout: {
        nodesep: {
            H5: 60,
            web: 80
        },
        ranksep: {
            H5: 80,
            web: 120
        },
        rankdir: {
            H5: 'TB',
            web: 'TB'
        },
        fitViewPadding: {
            H5: [20, 20, 20, 20],
            web: [30, 30, 30, 30]
        }
    },
    backgroundGrid: {
        H5: {
            background: `        
                linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px),
                linear-gradient(180deg, rgba(0,0,0,0.1) 1px, transparent 1px)`,
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
        },
        web: {
            background: `linear-gradient(45deg, #f8f9fa 25%, transparent 25%),
                          linear-gradient(-45deg, #f8f9fa 25%, transparent 25%),
                          linear-gradient(45deg, transparent 75%, #f8f9fa 75%),
                          linear-gradient(-45deg, transparent 75%, #f8f9fa 75%)`,
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
        }
    }
};

const DEFAULT_LOGO_PATH = '../../images/agentimg/agentimg.jpg';

require(["jquery", "system", "layui"], function () {
    layui.use(['layer'], function () {
        initNodeGraph();
        initEventListeners();

        // 初始化跨iframe通信, 用于历史点击选中
        initCrossIframeCommunication();
    });
});

// 获取当前端点类型的配置
function getCurrentStyleConfig(configPath) {
    const pointType = objdata.pointType === 'H5' ? 'H5' : 'web';
    const pathArray = configPath.split('.');
    let config = NODE_STYLE_CONFIG;

    for (let path of pathArray) {
        config = config[path];
        if (!config) return null;
    }

    return config[pointType] || config.web;
}

function initNodeGraph() {
    const agentId = Arg("agent_id") || Arg("id");
    const pointType = Arg("pointType");
    const applicable_end = Arg("applicable_end");
    const applicable_role = Arg("applicable_role");
    objdata.pointType = pointType;
    objdata.applicable.applicable_end = [applicable_end];
    objdata.applicable.applicable_role = [applicable_role];

    if (!agentId) {
        showEmptyState('缺少必要参数：agent_id');
        return;
    }

    objdata.agent_id = agentId;
    setBackgroundStyle();
    loadNodeData();
}

function setBackgroundStyle() {
    const container = $('.graph-canvas');
    const pointType = objdata.pointType === 'H5' ? 'H5' : 'web';
    const bgConfig = NODE_STYLE_CONFIG.backgroundGrid[pointType];

    container.css({
        'background': bgConfig.background,
        'background-size': bgConfig.backgroundSize,
        'background-position': bgConfig.backgroundPosition
    });
}

function loadNodeData() {
    showLoading();
    let data = {
        "agent_id": [objdata.agent_id]
    };

    $.sm(function (re, err) {
        if (err) {
            hideLoading();
            layer.msg(err);
            showEmptyState('加载节点数据失败，请重试');
        } else {
            objdata.allNodeData = re || [];
            prepareAndRenderGraph();
        }
    }, ["w_agent_node_plugin.getList", $.msgwhere(data)]);
}

function prepareAndRenderGraph() {
    objdata.nodeRelationDataHTML = prepareRelationDataHTML(objdata.allNodeData);
    hideLoading();

    if (!objdata.nodeRelationDataHTML || objdata.nodeRelationDataHTML.nodes.length === 0) {
        showEmptyState('该智能体暂无节点数据');
        return;
    }

    require(['g6'], function(G6) {
        createNodeRelationGraph(G6, objdata.nodeRelationDataHTML);
        hideEmptyState();
        updateNodeCount();

        // 标记为已初始化
        objdata.isInitialized = true;

        // 延迟一点时间确保所有iframe都已创建和定位
        setTimeout(() => {
            updateAllIframePositions();
        }, 500);
    });
}

/**
 * 准备节点关系数据
 */
function prepareRelationDataHTML(nodeList) {
    if (!nodeList || nodeList.length === 0) {
        return { nodes: [], edges: [] };
    }

    const nodes = [];
    const edges = [];
    const nodeMap = new Map();

    nodeList.forEach(node => {
        nodeMap.set(node.id, node);
    });

    // 准备节点数据 - 统一使用自定义节点
    nodeList.forEach(node => {
        const nodeName = node.node_name || `节点${node.id}`;
        const nodeSize = getCurrentStyleConfig('size');

        nodes.push({
            id: node.id.toString(),
            label: nodeName,
            size: nodeSize,
            type: 'unified-custom-node', // 统一使用一个节点类型
            nodeData: node,
            style: {
                fill: 'transparent',
                stroke: 'transparent'
            }
        });
    });

    // 准备边数据
    nodeList.forEach(node => {
        if (node.parent_id && node.parent_id !== '0' && nodeMap.has(parseInt(node.parent_id))) {
            edges.push({
                source: node.parent_id.toString(),
                target: node.id.toString(),
                type: 'quadratic',
                style: {
                    stroke: '#1890ff',
                    lineWidth: 2,
                    strokeOpacity: 0.8,
                    endArrow: {
                        path: 'M 0,0 L 8,4 L 8,-4 Z',
                        fill: '#1890ff',
                        strokeOpacity: 1
                    }
                }
            });
        }
    });

    return { nodes, edges };
}

/**
 * 创建节点关系图  统一节点渲染
 */
function createNodeRelationGraph(G6, data) {
    const container = $('#nodeGraphContainer');

    if (objdata.currentGraph && !objdata.currentGraph.destroyed) {
        objdata.currentGraph.destroy();
        // 清理旧的iframe
        clearAllIframes();
    }

    // 创建HTML iframe容器
    createHtmlIframeContainer(container[0]);

    // 注册统一的自定义节点
    G6.registerNode('unified-custom-node', {
        draw(cfg, group) {
            return drawUnifiedNode(cfg, group);
        },
        afterDraw(cfg, group) {
            // 节点绘制完成后，对需要HTML渲染的节点创建iframe
            const nodeData = cfg.nodeData;
            if (nodeData.pld !== 0 && nodeData.plugin_type === 'code' && isHtmlContent(nodeData.content)) {
                createNodeIframe(cfg);
            }
            // TODO 其他类型也可以按照上面的逻辑进行扩展
        }
    });

    const graphConfig = getGraphConfig(container);
    const graph = new G6.Graph(graphConfig);
    objdata.currentGraph = graph;

    // 绑定事件
    bindGraphEvents(graph);

    // 设置数据并渲染
    graph.data(data);
    graph.render();

    // 自适应视图
    setTimeout(() => {
        if (graph && !graph.destroyed) {
            graph.fitView(30);
        }
        // 更新所有iframe位置
        updateAllIframePositions();
    }, 300);

    initGraphResize(graph);
}

/**
 * 创建HTML iframe容器
 */
function createHtmlIframeContainer(graphContainer) {
    // 移除旧容器
    const oldContainer = document.getElementById('html-iframe-container');
    if (oldContainer) {
        oldContainer.remove();
    }

    const iframeContainer = document.createElement('div');
    iframeContainer.id = 'html-iframe-container';
    iframeContainer.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 1000;
    `;

    graphContainer.style.position = 'relative';
    graphContainer.appendChild(iframeContainer);
}

/**
 * 绘制统一的自定义节点
 */
function drawUnifiedNode(cfg, group) {
    const nodeData = cfg.nodeData;
    const size = cfg.size || getCurrentStyleConfig('size');
    const width = size[0];
    const height = size[1];

    // 节点状态
    const isDisabled = nodeData.status !== 0;
    const hasPermission = checkNodePermission(nodeData);
    const isClicked = objdata.clickedNodes.has(nodeData.id.toString());

    // 判断是否为HTML渲染节点
    const isHtmlNode = nodeData.pld !== 0 && nodeData.plugin_type === 'code' && isHtmlContent(nodeData.content);

    // 创建主容器
    const shadowColor = isClicked ? NODE_STYLE_CONFIG.colors.shadowClicked : NODE_STYLE_CONFIG.colors.shadowDefault;
    const strokeColor = isDisabled || !hasPermission ? NODE_STYLE_CONFIG.colors.nodeBorderDisabled : NODE_STYLE_CONFIG.colors.nodeBorder;
    const fillColor = isHtmlNode ? 'transparent' : (isDisabled || !hasPermission ? NODE_STYLE_CONFIG.colors.nodeBackgroundDisabled : NODE_STYLE_CONFIG.colors.nodeBackground);

    const mainRect = group.addShape('rect', {
        attrs: {
            x: -width / 2,
            y: -height / 2,
            width: width,
            height: height,
            fill: fillColor,
            stroke: strokeColor,
            strokeWidth: 1,
            cursor: hasPermission && !isDisabled ? 'pointer' : 'not-allowed',
            shadowColor: shadowColor,
            shadowBlur: 8,
            shadowOffsetX: 2,
            shadowOffsetY: 2,
            radius: 8,
            opacity: isDisabled || !hasPermission ? 0.8 : 1
        },
        name: 'main-rect'
    });

    // 渲染内容
    const contentY = -height / 2;
    const titleHeight = getCurrentStyleConfig('titleHeight');

    if (!isHtmlNode) {
        // 非HTML节点渲染常规内容
        renderPluginContent(group, nodeData, contentY, width, height, titleHeight, isDisabled || !hasPermission);
    }

    // 渲染标题
    renderNodeTitle(group, cfg, width, height, titleHeight, strokeColor, hasPermission, isDisabled, isHtmlNode);

    // 权限锁定图标
    if (!hasPermission) {
        group.addShape('text', {
            attrs: {
                x: width / 2 - (isHtmlNode ? 15 : 10),
                y: -height / 2 + (isHtmlNode ? 15 : 10),
                text: '🔒',
                fontSize: getCurrentStyleConfig('fontSize.lockIcon'),
                textAlign: 'center',
                textBaseline: 'middle',
            },
            name: 'lock-icon'
        });
    }

    return mainRect;
}

/**
 * 为HTML节点创建iframe - 防止重复创建
 */
function createNodeIframe(cfg) {
    const nodeData = cfg.nodeData;
    const nodeId = cfg.id;

    // 防止重复创建
    if (objdata.createdIframes.has(nodeId)) {
        return;
    }

    const size = cfg.size || getCurrentStyleConfig('size');
    const width = size[0];
    const height = size[1];
    const titleHeight = getCurrentStyleConfig('titleHeight');
    const contentHeight = height - titleHeight;

    // 节点状态检查
    const isDisabled = nodeData.status !== 0;
    const hasPermission = checkNodePermission(nodeData);

    if (!hasPermission || isDisabled) {
        return; // 无权限或禁用状态不创建iframe
    }

    // 创建iframe元素
    const iframe = document.createElement('iframe');
    iframe.id = `iframe-${nodeId}`;
    iframe.style.cssText = `
        position: absolute;
        width: ${width - 4}px;
        height: ${contentHeight - 2}px;
        border: none;
        border-radius: 6px 6px 0 0;
        background: white;
        pointer-events: auto;
        z-index: 1001;
        transform-origin: 0 0;
        box-sizing: border-box;
    `;

    // 优化iframe内容显示 - 自适应缩放
    const iframeContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
            <style>
                * { 
                    margin: 0; 
                    padding: 0; 
                    box-sizing: border-box; 
                }
                html, body {
                    width: 100%;
                    height: 100%;
                    overflow: hidden;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: #fff;
                    font-size: 12px;
                    line-height: 1.4;
                    color: #333;
                }
                
                /* 主容器 - 自适应缩放 */
                .iframe-content {
                    width: 100%;
                    height: 100%;       
                    display: flex;
                    flex-direction: column;
                    justify-content: flex-start;
                    align-items: stretch;
                    transform-origin: top left;
                    overflow: hidden;
                }

                /* 文本内容适配 */
                h1, h2, h3, h4, h5, h6 { 
                    font-size: 11px; 
                    margin: 2px 0;
                    font-weight: bold;
                    line-height: 1.2;
                }
                
                p, div { 
                    font-size: 10px; 
                    margin: 1px 0;
                    line-height: 1.3;
                    word-wrap: break-word;
                }
                
                /* 图片适配 */
                img { 
                    max-width: 100%; 
                    max-height: 50px;
                    height: auto; 
                    object-fit: contain;
                    display: block;
                }
                
                /* 表格适配 */
                table { 
                    width: 100%; 
                    border-collapse: collapse; 
                    font-size: 8px;
                    margin: 2px 0;
                }
                td, th { 
                    padding: 1px 2px; 
                    border: 1px solid #ddd; 
                    font-size: 8px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    max-width: 60px;
                }
                th {
                    background: #f5f5f5;
                    font-weight: bold;
                }
                
                /* 代码适配 */
                pre, code { 
                    font-size: 8px; 
                    white-space: pre-wrap;
                    background: #f8f8f8;
                    padding: 2px 3px;
                    border-radius: 2px;
                    overflow: hidden;
                    word-wrap: break-word;
                }
                
                /* 列表适配 */
                ul, ol {
                    font-size: 9px;
                    padding-left: 12px;
                    margin: 1px 0;
                }
                li {
                    margin: 0;
                    line-height: 1.2;
                }
                
                /* 表单元素适配 */
                button, input, select, textarea {
                    font-size: 8px;
                    padding: 1px 3px;
                    margin: 1px;
                    border: 1px solid #ccc;
                    border-radius: 2px;
                    max-width: 100%;
                }
                
                /* 链接适配 */
                a {
                    color: #1890ff;
                    text-decoration: none;
                    font-size: 9px;
                }
                a:hover {
                    text-decoration: underline;
                }

                /* 响应式内容缩放 */
                @media screen and (max-width: 220px) {
                    .iframe-content {
                        transform: scale(0.9);
                    }
                }
                
                @media screen and (max-width: 80px) {
                    .iframe-content {
                        transform: scale(0.8);
                    }
                }

                /* 防止内容溢出 */
                .content-wrapper {
                    flex: 1;
                    overflow: hidden;
                    position: relative;
                }
                
                /* 长文本处理 */
                .text-content {
                    max-height: 100%;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    display: -webkit-box;
                    -webkit-line-clamp: 8;
                    -webkit-box-orient: vertical;
                }
            </style>
        </head>
        <body>
            <div class="iframe-content">
                <div class="content-wrapper">
                    <div class="text-content">
                        ${nodeData.content || '<div style="color: #999; text-align: center;">无内容</div>'}
                    </div>
                </div>
            </div>
        </body>
        </html>
    `;

    // 设置iframe内容
    iframe.srcdoc = iframeContent;

    // 添加错误处理
    iframe.onerror = function() {
        console.error('iframe加载失败:', nodeId);
    };

    // 添加到iframe容器
    const iframeContainer = document.getElementById('html-iframe-container');
    if (iframeContainer) {
        iframeContainer.appendChild(iframe);

        // 存储iframe引用
        objdata.htmlIframes.set(nodeId, iframe);
        objdata.createdIframes.add(nodeId);

        // 初始位置更新
        setTimeout(() => {
            updateIframePosition(nodeId);
        }, 100);
    }
}

/**
 * 更新单个iframe位置
 */
function updateIframePosition(nodeId) {
    if (!objdata.currentGraph || objdata.currentGraph.destroyed) return;

    const iframe = objdata.htmlIframes.get(nodeId);
    if (!iframe) return;

    const node = objdata.currentGraph.findById(nodeId);
    if (!node) return;

    const model = node.getModel();
    const size = model.size || getCurrentStyleConfig('size');
    const titleHeight = getCurrentStyleConfig('titleHeight');
    const contentHeight = size[1] - titleHeight;

    // 获取当前图表的缩放比例和平移信息
    const zoom = objdata.currentGraph.getZoom();
    const matrix = objdata.currentGraph.getGroup().getMatrix();

    // 获取图表容器的位置信息
    const container = objdata.currentGraph.getContainer();
    const containerRect = container.getBoundingClientRect();

    // 计算节点在画布上的实际位置（考虑平移）
    const canvasPoint = objdata.currentGraph.getCanvasByPoint(model.x || 0, model.y || 0);

    // 计算缩放后的尺寸
    const scaledWidth = (size[0] - 4) * zoom;
    const scaledHeight = (contentHeight - 2) * zoom;
    const scaledTitleHeight = titleHeight * zoom;

    // 计算iframe的最终位置（内容区域，排除标题）
    const finalX = canvasPoint.x - scaledWidth/2 + 2 * zoom;
    const finalY = canvasPoint.y - (size[1] * zoom)/2 + scaledTitleHeight + 2 * zoom;

    // 设置iframe位置和尺寸
    iframe.style.left = finalX  + 'px';
    iframe.style.top = finalY + 'px';
    iframe.style.width = scaledWidth + 'px';
    iframe.style.height = (scaledHeight - scaledTitleHeight) + 'px';
    iframe.style.display = 'block';
    iframe.style.transform = 'none';

    // 如果缩放太小，隐藏iframe避免显示异常
    if (zoom < 0.3) {
        iframe.style.display = 'none';
    }
}

/**
 * 更新所有iframe位置
 */
function updateAllIframePositions() {
    objdata.htmlIframes.forEach((iframe, nodeId) => {
        updateIframePosition(nodeId);
    });
}

/**
 * 清理所有iframe
 */
function clearAllIframes() {
    objdata.htmlIframes.forEach((iframe, nodeId) => {
        if (iframe && iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
        }
    });
    objdata.htmlIframes.clear();
    objdata.createdIframes.clear();
}

/**
 * 获取节点在屏幕上的位置
 */
function getNodeScreenPosition(nodeItem) {
    const model = nodeItem.getModel();
    const canvasPoint = objdata.currentGraph.getCanvasByPoint(model.x || 0, model.y || 0);

    return {
        x: canvasPoint.x,
        y: canvasPoint.y
    };
}

/**
 * 获取图表配置
 */
function getGraphConfig(container) {
    const pointType = objdata.pointType === 'H5' ? 'H5' : 'web';
    const layoutConfig = NODE_STYLE_CONFIG.layout;

    return {
        container: container[0],
        width: container[0].clientWidth || 800,
        height: container[0].clientHeight || 600,
        renderer: 'canvas',
        pixelRatio: window.devicePixelRatio || 2,
        modes: {
            default: pointType === 'H5' ? [
                'drag-canvas',
                'zoom-canvas'
            ] : [
                'drag-canvas',
                'zoom-canvas',
                'drag-node'
            ]
        },
        defaultNode: {
            type: 'unified-custom-node',
            size: getCurrentStyleConfig('size')
        },
        defaultEdge: {
            type: 'polyline',
            style: {
                stroke: '#1890ff',
                lineWidth: 2,
                strokeOpacity: 0.8,
                endArrow: {
                    path: 'M 0,0 L 8,4 L 8,-4 Z',
                    fill: '#1890ff'
                }
            }
        },
        layout: {
            type: 'dagre',
            rankdir: layoutConfig.rankdir[pointType],
            align: 'DL',
            nodesep: layoutConfig.nodesep[pointType],
            ranksep: layoutConfig.ranksep[pointType]
        },
        fitView: true,
        fitViewPadding: layoutConfig.fitViewPadding[pointType]
    };
}

/**
 * 绑定图表事件
 */
function bindGraphEvents(graph) {
    // 节点点击事件 - 阻止iframe区域的点击传播
    graph.on('node:click', function(e) {
        const timeSinceDragStart = Date.now() - objdata.dragStartTime;
        if (objdata.isDragging && timeSinceDragStart > 200) return;

        const nodeModel = e.item.getModel();
        const nodeData = nodeModel.nodeData;

        // 检查点击位置是否在iframe区域内
        if (isClickOnIframeArea(e, nodeModel)) {
            return; // 点击在iframe区域内，不处理节点点击
        }

        const hasPermission = checkNodePermission(nodeData);
        if (!hasPermission) {
            layer.msg('您没有权限访问此节点');
            return;
        }

        if (nodeData.status !== 0) {
            layer.msg('该节点暂不可用');
            return;
        }

        selectedNode(nodeData, e.item);
    });

    // 拖拽事件 - 需要同步更新iframe位置
    graph.on('node:dragstart', function() {
        objdata.isDragging = true;
        objdata.dragStartTime = Date.now();
    });

    graph.on('node:drag', function() {
        // 拖拽过程中实时更新iframe位置
        requestAnimationFrame(() => {
            updateAllIframePositions();
        });
    });

    graph.on('node:dragend', function() {
        setTimeout(() => {
            objdata.isDragging = false;
            updateAllIframePositions();
        }, 150);
    });

    // 画布拖拽和缩放 - 需要同步更新iframe位置
    graph.on('canvas:dragstart', function() {
        objdata.isDragging = true;
    });

    graph.on('canvas:drag', function() {
        // 使用requestAnimationFrame优化性能
        requestAnimationFrame(() => {
            updateAllIframePositions();
        });
    });

    graph.on('canvas:dragend', function() {
        setTimeout(() => {
            objdata.isDragging = false;
            updateAllIframePositions();
        }, 100);
    });

    // 缩放事件 - 更新iframe缩放
    graph.on('wheelzoom', function() {
        requestAnimationFrame(() => {
            updateAllIframePositions();
        });
    });

    // 画布点击时暂不处理任何iframe相关逻辑
    graph.on('canvas:click', function() {
        // 暂不处理
    });

    // 监听图表的矩阵变换事件（更全面的位置更新触发）
    graph.on('viewportchange', function() {
        requestAnimationFrame(() => {
            updateAllIframePositions();
        });
    });
}

/**
 * 检查点击是否在iframe区域内
 */
function isClickOnIframeArea(e, nodeModel) {
    const nodeData = nodeModel.nodeData;
    const isHtmlNode = nodeData.pld !== 0 && nodeData.plugin_type === 'code' && isHtmlContent(nodeData.content);

    if (!isHtmlNode) return false;

    const size = nodeModel.size || getCurrentStyleConfig('size');
    const titleHeight = getCurrentStyleConfig('titleHeight');
    const contentHeight = size[1] - titleHeight;

    // 获取点击相对于节点中心的坐标
    const clickX = e.canvasX - nodeModel.x;
    const clickY = e.canvasY - nodeModel.y;

    // 检查是否在iframe内容区域内（排除标题区域）
    const inXRange = clickX >= -size[0]/2 + 2 && clickX <= size[0]/2 - 2;
    const inYRange = clickY >= -size[1]/2 + 2 && clickY <= size[1]/2 - titleHeight - 2;

    return inXRange && inYRange;
}

// 工具函数
function checkNodePermission(nodeData) {
    if (!nodeData.applicable_end && !nodeData.applicable_role) {
        return true;
    }
    if (nodeData.applicable_end === '全部' && nodeData.applicable_role === '全部') {
        return true;
    }

    let hasEndPermission = true;
    let hasRolePermission = true;

    if (nodeData.applicable_end) {
        const nodeEnds = nodeData.applicable_end.split(',').map(item => item.trim());
        hasEndPermission = nodeEnds.some(end => objdata.applicable.applicable_end.includes(end));
    }

    if (nodeData.applicable_role) {
        const nodeRoles = nodeData.applicable_role.split(',').map(item => item.trim());
        hasRolePermission = nodeRoles.some(role => objdata.applicable.applicable_role.includes(role));
    }

    return hasEndPermission && hasRolePermission;
}

function getPluginTypeConfig(pluginType) {
    return PLUGIN_TYPES[pluginType] || PLUGIN_TYPES.default;
}

function shouldShowLogo(nodeData) {
    if (nodeData.pld === 0 && nodeData.logo === '') {
        return { showLogo: true, logoPath: DEFAULT_LOGO_PATH };
    }

    if (nodeData.logo && !nodeData.logo.toString().match(/^\d+$/)) {
        return { showLogo: true, logoPath: ossPrefix + nodeData.logo };
    }

    return { showLogo: false, logoPath: null };
}

function isHtmlContent(content) {
    if (!content) return false;
    const htmlRegex = /<[^>]+>/;
    return htmlRegex.test(content);
}

function renderPluginContent(group, nodeData, contentY, width, height, titleHeight, isDisabled) {
    const contentHeight = height - titleHeight;
    const pluginConfig = getPluginTypeConfig(nodeData.plugin_type);
    const logoInfo = shouldShowLogo(nodeData);

    if (logoInfo.showLogo) {
        group.addShape('image', {
            attrs: {
                x: -width / 2,
                y: contentY,
                width: width,
                height: contentHeight,
                img: logoInfo.logoPath,
                cursor: !isDisabled ? 'pointer' : 'not-allowed',
                radius: 8,
                opacity: isDisabled ? 0.6 : 1
            },
            name: 'logo-image'
        });
        return;
    }

    let displayText = '';
    if (nodeData.pld === 0) {
        displayText = '默认内容';
    } else {
        displayText = nodeData.content ?
            (nodeData.content.length > 25 ? nodeData.content.substring(0, 25) + '...' : nodeData.content) :
            '无内容';
    }

    group.addShape('text', {
        attrs: {
            x: 0,
            y: contentY + contentHeight / 2,
            text: displayText,
            fontSize: getCurrentStyleConfig('fontSize.content'),
            fill: isDisabled ? NODE_STYLE_CONFIG.colors.contentTextDisabled : pluginConfig.textColor,
            textAlign: 'center',
            textBaseline: 'middle',
            cursor: 'pointer',
        },
        name: 'content-text'
    });
}

function renderNodeTitle(group, cfg, width, height, titleHeight, strokeColor, hasPermission, isDisabled, isHtmlNode = false) {
    // 标题背景
    group.addShape('rect', {
        attrs: {
            x: -width / 2,
            y: height / 2 - titleHeight,
            width: width,
            height: titleHeight,
            fill: hasPermission && !isDisabled ? NODE_STYLE_CONFIG.colors.nodeBackground : NODE_STYLE_CONFIG.colors.nodeBackgroundDisabled,
            cursor: hasPermission && !isDisabled ? 'pointer' : 'not-allowed',
            stroke: NODE_STYLE_CONFIG.colors.titleBorder,
            strokeWidth: 1,
            opacity: isDisabled || !hasPermission ? 0.6 : 1,
            radius: isHtmlNode ? [0, 0, 8, 8] : 8,
            textBaseline: 'top'
        },
        name: 'name-bg'
    });

    // 标题文字
    group.addShape('text', {
        attrs: {
            x: 0,
            y: height / 2 - titleHeight / 2,
            text: cfg.label,
            fontSize: getCurrentStyleConfig('fontSize.title'),
            fontWeight: 'bold',
            fill: isDisabled || !hasPermission ? NODE_STYLE_CONFIG.colors.titleTextDisabled : NODE_STYLE_CONFIG.colors.titleText,
            textAlign: 'center',
            textBaseline: 'middle',
            cursor: hasPermission && !isDisabled ? 'pointer' : 'not-allowed'
        },
        name: 'name-text'
    });
}

function selectedNode(nodeData, nodeItem) {
    objdata.clickedNodes.add(nodeData.id.toString());

    if (objdata.currentGraph) {
        objdata.currentGraph.getNodes().forEach(node => {
            objdata.currentGraph.updateItem(node, {
                style: {
                    stroke: NODE_STYLE_CONFIG.colors.nodeBorderDisabled,
                    strokeWidth: 1
                }
            });
        });

        objdata.currentGraph.updateItem(nodeItem, {
            style: {
                stroke: NODE_STYLE_CONFIG.colors.nodeBorderSelected,
                strokeWidth: 3
            }
        });

        // 刷新图表并更新iframe位置
        setTimeout(() => {
            objdata.currentGraph.refresh();
            // 确保iframe位置正确
            setTimeout(() => {
                updateAllIframePositions();
            }, 100);
        }, 100);
    }

    saveNodeClickLog(nodeData);
    handleNodeAction(nodeData);
    showNodeDetails(nodeData);
}

function saveNodeClickLog(nodeData) {
    $.sm(function (re, err) {
        if (err) {
            console.log(err);
        }
    }, ["node_click_log.add", JSON.stringify({
        agent_id: nodeData.agent_id,
        node_id: nodeData.id,
        oprid: "",
    })]);
}

function handleNodeAction(nodeData) {
    switch (nodeData.plugin_type) {
        case 'superlink':
            if (nodeData.url) {
                // window.open(nodeData.url, '_blank');
            } else {
                layer.msg('该超链接节点暂无URL配置');
            }
            break;

        case 'http':
            if (nodeData.api_url || nodeData.url) {
                const url = nodeData.api_url || nodeData.url;
                layer.confirm('是否要访问此HTTP接口？<br>' + url, {
                    icon: 3,
                    title: 'HTTP请求'
                }, function(index) {
                    // window.open(url, '_blank');
                    layer.close(index);
                });
            }
            break;

        case 'code':
            // HTML内容已经通过iframe在节点中直接渲染，点击时暂不处理
            // 可以在这里添加其他code类型的逻辑
            break;

        case 'function':
            if (nodeData.url) {
                // window.open(nodeData.url, '_blank');
            } else {
                showFunctionDetails(nodeData);
            }
            break;

        default:
            if (nodeData.url) {
                // window.open(nodeData.url, '_blank');
            } else {
                layer.msg('该节点暂无配置操作');
            }
            break;
    }
}

function showNodeDetails(nodeData) {
    // 可以在这里实现节点详情弹窗等功能
}

function showFunctionDetails(nodeData) {
    // 函数类型的点击处理
}

function initGraphResize(graph) {
    const resizeHandler = () => {
        if (!graph || graph.destroyed) return;

        const container = $('#nodeGraphContainer')[0];
        if (!container || !container.clientWidth || !container.clientHeight) return;

        graph.changeSize(container.clientWidth, container.clientHeight);
        graph.fitView(30);

        // 重新调整所有iframe位置
        setTimeout(() => {
            updateAllIframePositions();
        }, 100);
    };

    window.addEventListener('resize', resizeHandler);

    $(window).on('beforeunload', function() {
        window.removeEventListener('resize', resizeHandler);
        if (graph && !graph.destroyed) {
            graph.destroy();
        }
        // 清理iframe
        clearAllIframes();
    });
}

function initEventListeners() {
    $(window).on('resize', function() {
        if (objdata.currentGraph && !objdata.currentGraph.destroyed) {
            const container = $('#nodeGraphContainer')[0];
            if (container) {
                objdata.currentGraph.changeSize(container.clientWidth, container.clientHeight);
                objdata.currentGraph.fitView(30);

                // 更新iframe位置
                setTimeout(() => {
                    updateAllIframePositions();
                }, 100);
            }
        }
    });
}

// 页面状态管理函数
function showLoading() {
    objdata.isLoading = true;
    $('#loadingOverlay').show();
}

function hideLoading() {
    objdata.isLoading = false;
    $('#loadingOverlay').hide();
}

function showEmptyState(message = '暂无节点数据') {
    $('#emptyState').show();
    $('#emptyState .empty-text').text(message);
    updateNodeCount();
}

function hideEmptyState() {
    $('#emptyState').hide();
}

function updateNodeCount() {
    const count = objdata.allNodeData ? objdata.allNodeData.length : 0;
    const name = objdata.pointType === 'H5' ? '流程' : '节点';
    $('#nodeCount').text(`共 ${count} 个 ${name}`);
}

/**
 * 初始化跨iframe通信
 * 在require回调函数的最后调用
 */
function initCrossIframeCommunication() {
    // 监听来自父页面的消息
    window.addEventListener('message', function(event) {
        // 安全检查
        if (event.origin !== window.location.origin) {
            return;
        }

        const data = event.data;
        if (!data || typeof data !== 'object') {
            return;
        }

        switch (data.type) {
            case 'selectNode':
                handleNodeSelection(data.nodeId, data.nodeName);
                break;
            default:
                console.log('收到未知消息类型:', data.type);
        }
    });

    // 延迟发送ready消息，确保图表完全初始化
    const sendReadyMessage = () => {
        if (objdata.currentGraph && objdata.isInitialized) {
            window.parent.postMessage({
                type: 'graphReady'
            }, '*');
        } else {
            setTimeout(sendReadyMessage, 200);
        }
    };

    setTimeout(sendReadyMessage, 100);
}

/**
 * 处理节点选中请求
 */
function handleNodeSelection(nodeId, nodeName) {
    try {
        if (!objdata.currentGraph || objdata.currentGraph.destroyed) {
            throw new Error('图表未初始化或已销毁');
        }

        // 查找节点
        const targetNode = objdata.currentGraph.findById(nodeId.toString());
        if (!targetNode) {
            throw new Error(`未找到ID为 ${nodeId} 的节点`);
        }

        const nodeModel = targetNode.getModel();
        const nodeData = nodeModel.nodeData;

        if (!nodeData) {
            throw new Error('节点数据不存在');
        }

        // 检查权限和状态
        const hasPermission = checkNodePermission(nodeData);
        if (!hasPermission) {
            throw new Error('没有权限访问此节点');
        }

        if (nodeData.status !== 0) {
            throw new Error('该节点暂不可用');
        }

        // 1. 先聚焦到节点（这会让图表移动到合适位置）
        objdata.currentGraph.focusItem(targetNode, true, {
            duration: 800,
            easing: 'easeCubic'
        });

        // 2. 延迟执行选中操作，让动画完成
        setTimeout(() => {
            // 执行选中操作
            selectedNode(nodeData, targetNode);

            // 3. 选中后再次确保视图合适，并更新iframe位置
            setTimeout(() => {
                // 确保节点在视图中心
                objdata.currentGraph.focusItem(targetNode, false);

                // 手动触发iframe位置更新
                updateAllIframePositions();

                // 发送成功消息给父页面
                window.parent.postMessage({
                    type: 'nodeSelected',
                    nodeId: nodeId,
                    nodeName: nodeName
                }, '*');

            }, 100);

        }, 500); // 等待focusItem动画完成

    } catch (error) {
        console.error('选中节点失败:', error.message);

        // 发送失败消息给父页面
        window.parent.postMessage({
            type: 'nodeSelectFailed',
            nodeId: nodeId,
            error: error.message
        }, '*');
    }
}

