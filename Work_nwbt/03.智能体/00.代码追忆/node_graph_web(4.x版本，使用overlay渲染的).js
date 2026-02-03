/**
 * 作者：gongxi
 * 时间：2025-09-11
 * 智能体节点图表 - G6 v4版本 + DOM占位 HTML渲染方案
 * 保持原有Canvas渲染样式和交互效果，通过DOM overlay实现HTML内容渲染
 */

require.config({
    paths: {
        jquery: '../../sys/jquery',
        system: '../../sys/system',
        layui: "../../layui-btkj/layui",
        layuicommon: "../../sys/layuicommon",
        g6: "../../plugin/antv/g6/4.x.g6.min"  // 保持G6 v4
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

// 保持原有的objdata和PLUGIN_TYPES配置...
objdata = {
    // 智能体ID
    agent_id: null,
    // 节点数据存储
    allNodeData: [],
    nodeRelationDataHTML: null,
    // 图表实例
    currentGraph: null,
    // 页面状态
    isLoading: false,
    isInitialized: false,
    // 拖拽状态控制
    isDragging: false,
    dragStartTime: 0,
    // 点击过的节点记录
    clickedNodes: new Set(),
    // 地址栏传递
    applicable: {
        applicable_end: '',
        applicable_role: ''
    },
    pointType: '',
    // HTML overlay容器
    htmlOverlayContainer: null
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
    // 节点尺寸配置
    size: {
        H5: [180, 140],
        web: [220, 180]
    },
    // 标题区域高度
    titleHeight: {
        H5: 25,
        web: 30
    },
    // 字体大小配置
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
    // 颜色配置
    colors: {
        // 节点背景和边框
        nodeBackground: '#fff',
        nodeBackgroundDisabled: '#f5f5f5',
        nodeBorder: '#818181',
        nodeBorderDisabled: '#e8e8e8',
        nodeBorderSelected: '#1890ff',
        // 阴影颜色
        shadowDefault: 'rgba(24, 144, 255, 0.6)',
        shadowClicked: 'rgba(82, 196, 26, 0.8)',
        // 文字颜色
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
        // 标题区域边框
        titleBorder: '#e1e1e1',
        // HTML预览区域
        htmlPreviewBorder: '#52c41a',
        htmlPreviewBorderDisabled: '#d9d9d9',
        htmlPreviewBackground: '#fff',
        htmlPreviewBackgroundDisabled: '#f5f5f5'
    },
    // 布局配置
    layout: {
        // 节点间距
        nodesep: {
            H5: 60,
            web: 80
        },
        // 层级间距
        ranksep: {
            H5: 80,
            web: 120
        },
        // 布局方向
        rankdir: {
            H5: 'TB',
            web: 'LR'
        },
        // 视图内边距
        fitViewPadding: {
            H5: [20, 20, 20, 20],
            web: [30, 30, 30, 30]
        }
    },
    // 背景网格样式
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

    return config[pointType] || config.web; // 默认使用web配置
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
        objdata.isInitialized = true;
    });
}

/**
 * 准备节点关系数据 - G6 v4版本，所有节点都用Canvas，HTML内容通过overlay显示
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

    // 所有节点都使用自定义Canvas节点，HTML内容通过overlay处理
    nodeList.forEach(node => {
        const nodeName = node.node_name || `节点${node.id}`;
        const nodeSize = getCurrentStyleConfig('size');

        nodes.push({
            id: node.id.toString(),
            label: nodeName,
            size: nodeSize,
            type: 'custom-node',
            nodeData: node,
            style: {
                fill: 'transparent',
                stroke: 'transparent'
            }
        });
    });

    nodeList.forEach(node => {
        if (node.parent_id && node.parent_id !== '0' && nodeMap.has(parseInt(node.parent_id))) {
            edges.push({
                source: node.parent_id.toString(),
                target: node.id.toString(),
                type: 'cubic-horizontal',
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
 * 创建节点关系图 - G6 v4版本 + HTML overlay
 */
function createNodeRelationGraph(G6, data) {
    const container = $('#nodeGraphContainer');

    if (objdata.currentGraph && !objdata.currentGraph.destroyed) {
        objdata.currentGraph.destroy();
    }

    // 创建HTML overlay容器
    createHtmlOverlayContainer(container[0]);

    // 注册自定义节点
    G6.registerNode('custom-node', {
        draw(cfg, group) {
            const nodeData = cfg.nodeData;
            const size = cfg.size || getCurrentStyleConfig('size');
            const width = size[0];
            const height = size[1];

            // 节点状态
            const isDisabled = nodeData.status !== 0;
            const hasPermission = checkNodePermission(nodeData);
            const isClicked = objdata.clickedNodes.has(nodeData.id.toString());

            // 创建主容器
            const shadowColor = isClicked ? NODE_STYLE_CONFIG.colors.shadowClicked : NODE_STYLE_CONFIG.colors.shadowDefault;
            const strokeColor = isDisabled || !hasPermission ? NODE_STYLE_CONFIG.colors.nodeBorderDisabled : NODE_STYLE_CONFIG.colors.nodeBorder;
            const fillColor = isDisabled || !hasPermission ? NODE_STYLE_CONFIG.colors.nodeBackgroundDisabled : NODE_STYLE_CONFIG.colors.nodeBackground;

            const mainRect = group.addShape('rect', {
                attrs: {
                    x: -width / 2,
                    y: -height / 2,
                    width: width,
                    height: height,
                    fill: fillColor,
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

            // 内容区域
            const contentY = -height / 2;
            const titleHeight = getCurrentStyleConfig('titleHeight');

            // 根据是否为HTML内容显示不同的预览
            if (getPluginTypeConfig(nodeData.plugin_type).rendering === 'html' && isHtmlContent(nodeData.content)) {
                renderHtmlPreview(group, nodeData, contentY, width, height, titleHeight, isDisabled || !hasPermission);
            } else {
                renderPluginContent(group, nodeData, contentY, width, height, titleHeight, isDisabled || !hasPermission);
            }

            // 渲染节点名称
            renderNodeTitle(group, cfg, width, height, titleHeight, strokeColor, hasPermission, isDisabled);

            // 权限锁定图标
            if (!hasPermission) {
                group.addShape('text', {
                    attrs: {
                        x: width / 2 - 10,
                        y: -height / 2 + 10,
                        text: '🔒',
                        fontSize: getCurrentStyleConfig('fontSize.lockIcon'),
                        textAlign: 'center',
                        textBaseline: 'middle',
                    },
                    name: 'lock-icon'
                });
            }

            return mainRect;
        },

        // 节点创建后的回调，用于创建HTML overlay
        afterDraw(cfg, group) {
            const nodeData = cfg.nodeData;
            if (getPluginTypeConfig(nodeData.plugin_type).rendering === 'html' && isHtmlContent(nodeData.content)) {
                createNodeHtmlOverlay(cfg);  // todo overlay渲染的数据函数
            }
        }
    });

    const graphConfig = getGraphConfig(container);
    const graph = new G6.Graph(graphConfig);
    objdata.currentGraph = graph;

    bindGraphEvents(graph);

    graph.data(data);
    graph.render();

    setTimeout(() => {
        if (graph && !graph.destroyed) {
            graph.fitView(30);
        }
    }, 300);

    initGraphResize(graph);
}

/**
 * 创建HTML overlay容器
 */
function createHtmlOverlayContainer(graphContainer) {
    if (objdata.htmlOverlayContainer) {
        objdata.htmlOverlayContainer.remove();
    }

    objdata.htmlOverlayContainer = document.createElement('div');
    objdata.htmlOverlayContainer.id = 'html-overlay-container';
    objdata.htmlOverlayContainer.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 1000;
    `;

    graphContainer.style.position = 'relative';
    graphContainer.appendChild(objdata.htmlOverlayContainer);
}

/**
 * 为节点创建HTML overlay
 */
function createNodeHtmlOverlay(cfg) {
    const nodeData = cfg.nodeData;
    const nodeId = cfg.id;

    // 创建HTML overlay元素
    const overlay = document.createElement('div');
    overlay.id = `html-overlay-${nodeId}`;
    overlay.className = 'node-html-overlay';
    overlay.style.cssText = `
        position: absolute;
        background: white;
        border: 2px solid #52c41a;
        border-radius: 8px;
        padding: 12px;
        max-width: 400px;
        max-height: 300px;
        overflow: auto;
        pointer-events: auto;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1001;
        display: none;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // 添加标题
    const title = document.createElement('div');
    title.style.cssText = `
        font-weight: bold;
        font-size: 14px;
        margin-bottom: 8px;
        color: #333;
        border-bottom: 1px solid #f0f0f0;
        padding-bottom: 8px;
    `;
    title.textContent = `${nodeData.node_name || '代码节点'} - HTML内容`;

    // 添加HTML内容  TODO 这部分就是渲染的插件的html
    const content = document.createElement('div');
    content.innerHTML = sanitizeHtml(nodeData.content);

    overlay.appendChild(title);
    overlay.appendChild(content);

    // 添加关闭按钮
    const closeBtn = document.createElement('div');
    closeBtn.style.cssText = `
        position: absolute;
        top: 8px;
        right: 8px;
        width: 20px;
        height: 20px;
        cursor: pointer;
        text-align: center;
        line-height: 18px;
        border-radius: 50%;
        background: #f0f0f0;
        font-size: 12px;
        color: #666;
    `;
    closeBtn.innerHTML = '×';
    closeBtn.onclick = () => {
        overlay.style.display = 'none';
    };

    overlay.appendChild(closeBtn);
    objdata.htmlOverlayContainer.appendChild(overlay);

    // 存储overlay引用到节点配置中
    cfg.htmlOverlay = overlay;
}

/**
 * 渲染HTML预览（在Canvas节点中显示提示）
 * TODO  后续可能会换为动态的内容，异步请求  这部分不好处理，变化太多了
 *  而且需要针对H5和web 进行适配 前面设计了H5和web的节点尺寸
 */
function renderHtmlPreview(group, nodeData, contentY, width, height, titleHeight, isDisabled) {
    const contentHeight = height - titleHeight;

    // 添加HTML图标
    group.addShape('text', {
        attrs: {
            x: -65,
            y: contentY + 20,
            text: '2025-08-05',
            fontSize: getCurrentStyleConfig('fontSize.date'),
            fill: isDisabled ? NODE_STYLE_CONFIG.colors.dateTextDisabled : NODE_STYLE_CONFIG.colors.dateText,
            textAlign: 'center',
            textBaseline: 'middle',
            opacity: isDisabled ? 0.6 : 1
        },
        name: 'date-title'
    });

    // 添加主要内容区域背景
    const mainContentY = contentY + 45;
    const mainContentHeight = 60;
    group.addShape('rect', {
        attrs: {
            x: -100,
            y: mainContentY -10,
            width: 200,
            height: mainContentHeight + 20,
            fill: isDisabled ? NODE_STYLE_CONFIG.colors.htmlPreviewBackgroundDisabled : NODE_STYLE_CONFIG.colors.htmlPreviewBackground,
            stroke: isDisabled ? NODE_STYLE_CONFIG.colors.htmlPreviewBorderDisabled : NODE_STYLE_CONFIG.colors.htmlPreviewBorder,
            strokeWidth: 2,
            radius: 8,
            opacity: isDisabled ? 0.6 : 1
        },
        name: 'main-content-bg'
    });

    group.addShape('text', {
        attrs: {
            x: -50,
            y: mainContentY + 10,
            text: '等级人数'+'(共' + 100 + '人)',
            fontSize: getCurrentStyleConfig('fontSize.count'),
            fill: isDisabled ? NODE_STYLE_CONFIG.colors.contentTextDisabled : NODE_STYLE_CONFIG.colors.contentText,
            textAlign: 'center',
            textBaseline: 'middle',
            fontWeight: 'bold'
        },
        name: 'count-number'
    });

    // 添加左侧统计信息
    group.addShape('text', {
        attrs: {
            x: -50,
            y: mainContentY + 30,
            text: '95人',
            fontSize: getCurrentStyleConfig('fontSize.mainNumber'),
            fill: isDisabled ? NODE_STYLE_CONFIG.colors.countNumberDisabled : NODE_STYLE_CONFIG.colors.countNumber,
            textAlign: 'center',
            textBaseline: 'middle',
            fontWeight: 'bold'
        },
        name: 'count-number'
    });
    group.addShape('text', {
        attrs: {
            x: -50,
            y: mainContentY + 50,
            text: '已操作',
            fontSize: getCurrentStyleConfig('fontSize.subLabel'),
            fill: isDisabled ? NODE_STYLE_CONFIG.colors.subLabelTextDisabled : NODE_STYLE_CONFIG.colors.subLabelText,
            textAlign: 'center',
            textBaseline: 'middle'
        },
        name: 'count-label'
    });

// 添加右侧百分比信息
    group.addShape('text', {
        attrs: {
            x: 50,
            y: mainContentY + 30,
            text: '95%',
            fontSize: getCurrentStyleConfig('fontSize.mainNumber'),
            fill: isDisabled ? NODE_STYLE_CONFIG.colors.percentageTextDisabled : NODE_STYLE_CONFIG.colors.percentageText,
            textAlign: 'center',
            textBaseline: 'middle',
            fontWeight: 'bold'
        },
        name: 'percentage-number'
    });

    group.addShape('text', {
        attrs: {
            x: 50,
            y: mainContentY + 50,
            text: '刷卡率',
            fontSize: getCurrentStyleConfig('fontSize.subLabel'),
            fill: isDisabled ? NODE_STYLE_CONFIG.colors.subLabelTextDisabled : NODE_STYLE_CONFIG.colors.subLabelText,
            backgroundColor: NODE_STYLE_CONFIG.colors.subLabelTextDisabled,
            textAlign: 'center',
            textBaseline: 'middle'
        },
        name: 'percentage-label'
    });
}

/**
 * 显示HTML overlay
 */
function showHtmlOverlay(nodeItem) {
    const cfg = nodeItem.getModel();
    const overlay = cfg.htmlOverlay;

    if (overlay) {
        // 获取节点位置
        const position = getNodeScreenPosition(nodeItem);
        overlay.style.left = position.x + 'px';
        overlay.style.top = position.y + 'px';
        overlay.style.display = 'block';

        // 确保overlay在视窗内
        adjustOverlayPosition(overlay);
    }
}

/**
 * 获取节点在屏幕上的位置
 */
function getNodeScreenPosition(nodeItem) {
    const model = nodeItem.getModel();
    const canvasPoint = objdata.currentGraph.getCanvasByPoint(model.x || 0, model.y || 0);
    const container = objdata.currentGraph.getContainer();
    const containerRect = container.getBoundingClientRect();

    return {
        x: containerRect.left + canvasPoint.x + 120, // 节点右侧
        y: containerRect.top + canvasPoint.y - 100
    };
}

/**
 * 调整overlay位置，确保在视窗内
 */
function adjustOverlayPosition(overlay) {
    const rect = overlay.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 右边界调整
    if (rect.right > viewportWidth - 20) {
        overlay.style.left = (viewportWidth - rect.width - 20) + 'px';
    }

    // 下边界调整
    if (rect.bottom > viewportHeight - 20) {
        overlay.style.top = (viewportHeight - rect.height - 20) + 'px';
    }

    // 左边界调整
    if (rect.left < 20) {
        overlay.style.left = '20px';
    }

    // 上边界调整
    if (rect.top < 20) {
        overlay.style.top = '20px';
    }
}

/**
 * 绑定图表事件 - 增加HTML overlay处理
 */
function bindGraphEvents(graph) {
    // 节点点击事件
    graph.on('node:click', function(e) {
        const timeSinceDragStart = Date.now() - objdata.dragStartTime;
        if (objdata.isDragging && timeSinceDragStart > 200) return;

        const nodeModel = e.item.getModel();
        const nodeData = nodeModel.nodeData;

        const hasPermission = checkNodePermission(nodeData);
        if (!hasPermission) {
            layer.msg('您没有权限访问此节点');
            return;
        }

        if (nodeData.status !== 0) {
            layer.msg('该节点暂不可用');
            return;
        }

        // 如果是HTML节点，显示overlay
        if (getPluginTypeConfig(nodeData.plugin_type).rendering === 'html' && isHtmlContent(nodeData.content)) {
            showHtmlOverlay(e.item);
        }

        selectedNode(nodeData, e.item);
    });

    // 拖拽事件
    graph.on('node:dragstart', function() {
        objdata.isDragging = true;
        objdata.dragStartTime = Date.now();
        // 隐藏所有overlay
        hideAllHtmlOverlays();
    });

    graph.on('node:dragend', function() {
        setTimeout(() => {
            objdata.isDragging = false;
        }, 150);
    });

    // 画布点击时隐藏所有overlay
    graph.on('canvas:click', function() {
        hideAllHtmlOverlays();
    });

    // 画布拖拽优化
    graph.on('canvas:dragstart', function() {
        objdata.isDragging = true;
        hideAllHtmlOverlays();
    });

    graph.on('canvas:dragend', function() {
        setTimeout(() => {
            objdata.isDragging = false;
        }, 100);
    });
}

/**
 * 隐藏所有HTML overlay
 */
function hideAllHtmlOverlays() {
    if (objdata.htmlOverlayContainer) {
        const overlays = objdata.htmlOverlayContainer.querySelectorAll('.node-html-overlay');
        overlays.forEach(overlay => {
            overlay.style.display = 'none';
        });
    }
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
            type: 'custom-node',
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

function sanitizeHtml(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    // 去除危险标签
    const dangerousTags = ['script', 'object', 'embed', 'form', 'iframe'];
    dangerousTags.forEach(tag => {
        const elements = temp.querySelectorAll(tag);
        elements.forEach(el => el.remove());
    });

    const allElements = temp.querySelectorAll('*');
    allElements.forEach(el => {
        Array.from(el.attributes).forEach(attr => {
            if (attr.name.startsWith('on')) {
                el.removeAttribute(attr.name);
            }
        });
    });

    return temp.innerHTML;
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

function renderNodeTitle(group, cfg, width, height, titleHeight, strokeColor, hasPermission, isDisabled) {
    group.addShape('rect', {
        attrs: {
            x: -width / 2,
            y: height / 2 - titleHeight,
            width: width,
            height: titleHeight,
            cursor: hasPermission && !isDisabled ? 'pointer' : 'not-allowed',
            stroke: NODE_STYLE_CONFIG.colors.titleBorder,
            opacity: isDisabled || !hasPermission ? 0.6 : 1,
            radius: 8,
            textBaseline:'top'
        },
        name: 'name-bg'
    });

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

        setTimeout(() => {
            objdata.currentGraph.refresh();
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
        } else {
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
            } else {
                // showNodeDetails(nodeData);
            }
            break;

        case 'code':
            if (nodeData.url) {
                // window.open(nodeData.url, '_blank');
            } else {
            }
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
    // 函数类型的点击
}

function initGraphResize(graph) {
    const resizeHandler = () => {
        if (!graph || graph.destroyed) return;

        const container = $('#nodeGraphContainer')[0];
        if (!container || !container.clientWidth || !container.clientHeight) return;

        graph.changeSize(container.clientWidth, container.clientHeight);
        graph.fitView(30);

        // 隐藏overlay，因为位置可能已改变
        hideAllHtmlOverlays();
    };

    window.addEventListener('resize', resizeHandler);

    $(window).on('beforeunload', function() {
        window.removeEventListener('resize', resizeHandler);
        if (graph && !graph.destroyed) {
            graph.destroy();
        }
        // 清理HTML overlay容器
        if (objdata.htmlOverlayContainer) {
            objdata.htmlOverlayContainer.remove();
        }
    });
}

function initEventListeners() {
    $(window).on('resize', function() {
        if (objdata.currentGraph && !objdata.currentGraph.destroyed) {
            const container = $('#nodeGraphContainer')[0];
            if (container) {
                objdata.currentGraph.changeSize(container.clientWidth, container.clientHeight);
                objdata.currentGraph.fitView(30);
                hideAllHtmlOverlays();
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
    const name = objdata.pointType === 'H5' ?  '流程':'节点' ;
    $('#nodeCount').text(`共 ${count} 个 ${name}`);
}