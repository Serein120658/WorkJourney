/**
 * 作者：gongxi
 * 时间：2025-09-11
 * 智能体节点图表 - G6 5.x重构版本，支持HTML节点渲染，解决code类型节点TODO问题
 * 保持原有Canvas渲染样式和交互效果，增强HTML内容渲染能力
 */

require.config({
    paths: {
        jquery: '../../sys/jquery',
        system: '../../sys/system',
        layui: "../../layui-btkj/layui",
        layuicommon: "../../sys/layuicommon",
        g6: "../../plugin/antv/g6/5.x.g6.min" // 更新为5.x版本
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

    // 设备类型检测
    isMobile: false,
    isTouch: false
};

// 插件类型配置 - 集中管理颜色和样式
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
        rendering: 'html'   // 使用HTML渲染
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

// 默认图片路径配置
const DEFAULT_LOGO_PATH = '../../images/agentimg/agentimg.jpg';

require(["jquery", "system", "layui"], function () {
    layui.use(['layer'], function () {
        // 设备检测
        detectDevice();
        // 初始化页面
        initNodeGraph();
        initEventListeners();
    });
});

/**
 * 设备检测
 */
function detectDevice() {
    objdata.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    objdata.isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * 初始化节点图表 - 主入口函数
 */
function initNodeGraph() {
    // 获取URL参数中的agent_id
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

    // 根据端类型设置背景样式
    setBackgroundStyle();

    // 加载节点数据
    loadNodeData();
}

/**
 * 设置背景样式 - 根据端类型适配
 */
function setBackgroundStyle() {
    const container = $('.graph-canvas');

    if (objdata.pointType === 'H5' || objdata.isMobile) {
        // H5端使用方格线
        container.css({
            'background': `        
                linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px),
                linear-gradient(180deg, rgba(0,0,0,0.1) 1px, transparent 1px)`,
            'background-size': '20px 20px',
            'background-position': '0 0, 0 10px, 10px -10px, -10px 0px'
        });
    } else {
        // Web端保持原有网格背景
        container.css({
            'background': `linear-gradient(45deg, #f8f9fa 25%, transparent 25%),
                          linear-gradient(-45deg, #f8f9fa 25%, transparent 25%),
                          linear-gradient(45deg, transparent 75%, #f8f9fa 75%),
                          linear-gradient(-45deg, transparent 75%, #f8f9fa 75%)`,
            'background-size': '20px 20px',
            'background-position': '0 0, 0 10px, 10px -10px, -10px 0px'
        });
    }
}

/**
 * 加载节点数据 - 统一数据加载方式
 */
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
            // 准备关系数据并渲染图表
            prepareAndRenderGraph();
        }
    }, ["w_agent_node_plugin.getList", $.msgwhere(data)]);
}

/**
 * 准备数据并渲染图表
 */
function prepareAndRenderGraph() {
    // 准备节点关系数据 - 使用G6 5.x格式
    objdata.nodeRelationDataHTML = prepareRelationDataForG6V5(objdata.allNodeData);

    hideLoading();

    if (!objdata.nodeRelationDataHTML || objdata.nodeRelationDataHTML.nodes.length === 0) {
        showEmptyState('该智能体暂无节点数据');
        return;
    }

    // 动态加载 G6 库并创建关系图
    require(['g6'], function(G6) {
        createNodeRelationGraphV5(G6, objdata.nodeRelationDataHTML);
        hideEmptyState();
        updateNodeCount();
        objdata.isInitialized = true;
    });
}

/**
 * 准备G6 5.x格式的节点关系数据
 */
function prepareRelationDataForG6V5(nodeList) {
    if (!nodeList || nodeList.length === 0) {
        return { nodes: [], edges: [] };
    }

    const nodes = [];
    const edges = [];
    const nodeMap = new Map();

    // 创建节点映射
    nodeList.forEach(node => {
        nodeMap.set(node.id, node);
    });

    // 生成节点数据 - G6 5.x格式
    nodeList.forEach(node => {
        const nodeName = node.node_name || `节点${node.id}`;
        const nodeSize = (objdata.pointType === 'H5' || objdata.isMobile) ? [180, 140] : [220, 180];
        const pluginConfig = getPluginTypeConfig(node.plugin_type);

        let nodeConfig = {
            id: node.id.toString(),
            data: {
                label: nodeName,
                nodeData: node, // 原始节点数据
                pluginConfig: pluginConfig
            }
        };

        // 根据插件类型和渲染方式设置不同的节点类型和样式
        if (pluginConfig.rendering === 'html') {
            // HTML渲染节点（主要用于code类型）
            nodeConfig.type = 'html';
            nodeConfig.style = {
                size: nodeSize,
                innerHTML: getHtmlNodeContent(node), // 获取HTML内容
                x: 0,
                y: 0
            };
        } else {
            // Canvas渲染节点（其他类型）
            nodeConfig.type = 'canvas-node';
            nodeConfig.style = {
                size: nodeSize,
                fill: 'transparent',
                stroke: 'transparent'
            };
        }

        nodes.push(nodeConfig);
    });

    // 生成边数据 - G6 5.x格式
    nodeList.forEach(node => {
        if (node.parent_id && node.parent_id !== '0' && nodeMap.has(parseInt(node.parent_id))) {
            edges.push({
                id: `edge-${node.parent_id}-${node.id}`,
                source: node.parent_id.toString(),
                target: node.id.toString(),
                data: {},
                style: {
                    stroke: '#1890ff',
                    lineWidth: 2,
                    opacity: 0.8,
                    endArrow: {
                        type: 'vee',
                        size: 10,
                        fill: '#1890ff'
                    }
                }
            });
        }
    });

    return { nodes, edges };
}

/**
 * 创建G6 5.x版本的节点关系图
 */
function createNodeRelationGraphV5(G6, data) {
    const container = document.getElementById('nodeGraphContainer');

    // 销毁现有图表实例
    if (objdata.currentGraph && !objdata.currentGraph.destroyed) {
        objdata.currentGraph.destroy();
    }

    // 注册HTML节点类型扩展（G6 5.x方式）
    G6.register('node', 'html', {
        draw: function(model, group, graph) {
            const { data: nodeData } = model;
            const innerHTML = model.style.innerHTML;
            const size = model.style.size || [220, 180];

            // 创建HTML容器
            const htmlContainer = document.createElement('div');
            htmlContainer.innerHTML = innerHTML;
            htmlContainer.style.width = size[0] + 'px';
            htmlContainer.style.height = size[1] + 'px';
            htmlContainer.style.position = 'absolute';
            htmlContainer.style.pointerEvents = 'auto';
            htmlContainer.style.transform = 'translate(-50%, -50%)';

            // 添加到图表容器中
            container.appendChild(htmlContainer);

            // 创建一个透明的图形作为锚点
            const keyShape = group.addShape('rect', {
                attrs: {
                    x: -size[0] / 2,
                    y: -size[1] / 2,
                    width: size[0],
                    height: size[1],
                    fill: 'transparent',
                    stroke: 'transparent'
                },
                name: 'html-anchor'
            });

            // 存储HTML元素引用
            keyShape.htmlElement = htmlContainer;

            return keyShape;
        },

        update: function(model, item, graph) {
            const keyShape = item.getKeyShape();
            if (keyShape.htmlElement) {
                const innerHTML = model.style.innerHTML;
                keyShape.htmlElement.innerHTML = innerHTML;
            }
        }
    });

    // 注册Canvas节点类型
    G6.register('node', 'canvas-node', {
        draw: function(model, group, graph) {
            const { data } = model;
            const nodeData = data.nodeData;
            const size = model.style.size || [220, 180];
            const width = size[0];
            const height = size[1];

            // 节点状态
            const isDisabled = nodeData.status !== 0;
            const hasPermission = checkNodePermission(nodeData);
            const isClicked = objdata.clickedNodes.has(nodeData.id.toString());

            // 创建主容器
            const shadowColor = isClicked ? 'rgba(82, 196, 26, 0.8)' : 'rgba(24, 144, 255, 0.6)';
            const strokeColor = isDisabled || !hasPermission ? '#e8e8e8' : '#12ecb2';

            const mainRect = group.addShape('rect', {
                attrs: {
                    x: -width / 2,
                    y: -height / 2,
                    width: width,
                    height: height,
                    fill: isDisabled || !hasPermission ? '#f5f5f5' : '#fff',
                    stroke: strokeColor,
                    lineWidth: 1,
                    cursor: hasPermission && !isDisabled ? 'pointer' : 'not-allowed',
                    shadowColor: shadowColor,
                    shadowBlur: 8,
                    shadowOffsetX: 2,
                    shadowOffsetY: 2,
                    radius: 4,
                    opacity: isDisabled || !hasPermission ? 0.8 : 1
                },
                name: 'main-rect'
            });

            // 渲染节点内容
            renderCanvasNodeContent(group, nodeData, width, height, isDisabled || !hasPermission);

            return mainRect;
        }
    });

    // 获取图表配置 - G6 5.x格式
    const graphConfig = getGraphConfigV5(container);

    // 创建 G6 5.x 图实例
    const graph = new G6.Graph(graphConfig);

    // 存储图表实例
    objdata.currentGraph = graph;

    // 绑定事件
    bindGraphEventsV5(graph);

    // 设置数据并渲染
    graph.addData(data);
    graph.render();

    // 延迟执行自适应画布
    setTimeout(() => {
        if (graph && !graph.destroyed) {
            graph.fitView();
        }
    }, 300);

    // 响应式处理
    initGraphResize(graph);
}

/**
 * 获取HTML节点内容 - 专门用于code类型节点的HTML渲染
 */
function getHtmlNodeContent(nodeData) {
    const pluginConfig = getPluginTypeConfig(nodeData.plugin_type);
    const isDisabled = nodeData.status !== 0;
    const hasPermission = checkNodePermission(nodeData);

    const nodeId = nodeData.id;
    const nodeTitle = nodeData.node_name || `节点${nodeId}`;
    const content = nodeData.content || '// 暂无代码内容';

    // 检测编程语言
    const language = detectProgrammingLanguage(content) || 'javascript';

    return `
        <div class="html-code-node" 
             data-node-id="${nodeId}"
             data-plugin-type="${nodeData.plugin_type}"
             onclick="handleHtmlNodeClick('${nodeId}')"
             style="
                width: 100%;
                height: 100%;
                background: ${isDisabled || !hasPermission ? '#f5f5f5' : '#fff'};
                border: 2px solid ${isDisabled || !hasPermission ? '#e8e8e8' : pluginConfig.borderColor};
                border-radius: 8px;
                overflow: hidden;
                opacity: ${isDisabled || !hasPermission ? 0.6 : 1};
                pointer-events: ${hasPermission && !isDisabled ? 'auto' : 'none'};
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                cursor: ${hasPermission && !isDisabled ? 'pointer' : 'not-allowed'};
                display: flex;
                flex-direction: column;
                transition: all 0.3s ease;
             "
             onmouseover="this.style.transform='scale(1.02)'; this.style.boxShadow='0 6px 20px rgba(0,0,0,0.2)';"
             onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.15)';">
            
            <!-- 节点标题栏 -->
            <div class="node-header" style="
                padding: 12px 16px;
                background: linear-gradient(135deg, ${pluginConfig.bgColor} 0%, ${adjustColor(pluginConfig.bgColor, -10)} 100%);
                border-bottom: 1px solid ${pluginConfig.borderColor};
                font-weight: 600;
                font-size: 13px;
                color: ${isDisabled || !hasPermission ? '#999' : '#2c3e50'};
                display: flex;
                justify-content: space-between;
                align-items: center;
                min-height: 40px;
            ">
                <span class="node-title" title="${nodeTitle}">
                    ${nodeTitle.length > 20 ? nodeTitle.substring(0, 20) + '...' : nodeTitle}
                </span>
                <div class="node-badges" style="display: flex; align-items: center; gap: 6px;">
                    <span class="language-badge" style="
                        background: ${pluginConfig.textColor};
                        color: #fff;
                        padding: 3px 8px;
                        border-radius: 12px;
                        font-size: 10px;
                        font-weight: 500;
                        text-transform: uppercase;
                    ">${language}</span>
                    <span class="code-icon" style="font-size: 16px;">💻</span>
                    ${!hasPermission ? '<span class="lock-icon" style="font-size: 14px;">🔒</span>' : ''}
                </div>
            </div>
            
            <!-- 代码内容区域 -->
            <div class="node-content" style="
                flex: 1;
                padding: 16px;
                overflow: auto;
                font-size: 11px;
                line-height: 1.5;
                background: #fafafa;
                position: relative;
            ">
                <pre style="
                    margin: 0;
                    padding: 0;
                    font-family: inherit;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                    color: #2c3e50;
                "><code class="language-${language}">${escapeHtml(content.substring(0, 200) + (content.length > 200 ? '\n...' : ''))}</code></pre>
                
                ${content.length > 200 ? `
                <div style="
                    position: absolute;
                    bottom: 8px;
                    right: 12px;
                    background: rgba(0,0,0,0.7);
                    color: #fff;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 10px;
                ">
                    ${content.length} chars
                </div>
                ` : ''}
            </div>
            
            <!-- 状态指示器 -->
            <div class="status-bar" style="
                padding: 8px 16px;
                background: rgba(0,0,0,0.02);
                border-top: 1px solid rgba(0,0,0,0.1);
                font-size: 10px;
                color: #666;
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <span>🟢 ${isDisabled ? 'Disabled' : 'Ready'}</span>
                <span>${new Date().toLocaleTimeString()}</span>
            </div>
        </div>
    `;
}

/**
 * 处理HTML节点点击事件
 */
function handleHtmlNodeClick(nodeId) {
    console.log('HTML节点被点击:', nodeId);

    // 阻止事件冒泡
    event.stopPropagation();

    // 找到对应的节点数据
    const nodeData = objdata.allNodeData.find(node => node.id.toString() === nodeId);
    if (!nodeData) return;

    // 检查权限
    const hasPermission = checkNodePermission(nodeData);
    if (!hasPermission) {
        layer.msg('您没有权限访问此节点');
        return;
    }

    // 检查节点状态
    if (nodeData.status !== 0) {
        layer.msg('该节点暂不可用');
        return;
    }

    // 执行节点选择逻辑
    selectedNode(nodeData, null);
}

/**
 * 渲染Canvas节点内容
 */
function renderCanvasNodeContent(group, nodeData, width, height, isDisabled) {
    const contentY = -height / 2;
    const titleHeight = (objdata.pointType === 'H5' || objdata.isMobile) ? 25 : 30;
    const contentHeight = height - titleHeight;
    const pluginConfig = getPluginTypeConfig(nodeData.plugin_type);

    // 检查是否需要显示logo
    const logoInfo = shouldShowLogo(nodeData);

    if (logoInfo.showLogo) {
        // 显示logo图片
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
    } else {
        // 渲染默认文本内容
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
                fontSize: (objdata.pointType === 'H5' || objdata.isMobile) ? 9 : 11,
                fill: isDisabled ? '#999' : pluginConfig.textColor,
                textAlign: 'center',
                textBaseline: 'middle',
                cursor: 'pointer',
            },
            name: 'content-text'
        });
    }

    // 渲染节点标题
    renderCanvasNodeTitle(group, nodeData, width, height, titleHeight, isDisabled);
}

/**
 * 渲染Canvas节点标题
 */
function renderCanvasNodeTitle(group, nodeData, width, height, titleHeight, isDisabled) {
    const strokeColor = isDisabled ? '#e8e8e8' : '#12ecb2';
    const nodeName = nodeData.node_name || `节点${nodeData.id}`;

    // 节点名称背景
    group.addShape('rect', {
        attrs: {
            x: -width / 2,
            y: height / 2 - titleHeight,
            width: width,
            height: titleHeight,
            fill: isDisabled ? '#f5f5f5' : '#fff',
            stroke: strokeColor,
            lineWidth: 1,
            cursor: !isDisabled ? 'pointer' : 'not-allowed',
            opacity: isDisabled ? 0.6 : 1
        },
        name: 'name-bg'
    });

    // 节点名称文本
    group.addShape('text', {
        attrs: {
            x: 0,
            y: height / 2 - titleHeight / 2,
            text: nodeName,
            fontSize: (objdata.pointType === 'H5' || objdata.isMobile) ? 10 : 12,
            fontWeight: 'bold',
            fill: isDisabled ? '#999' : '#2c3e50',
            textAlign: 'center',
            textBaseline: 'middle',
            cursor: !isDisabled ? 'pointer' : 'not-allowed'
        },
        name: 'name-text'
    });
}

/**
 * 获取G6 5.x版本的图表配置
 */
function getGraphConfigV5(container) {
    const isMobileDevice = objdata.pointType === 'H5' || objdata.isMobile;

    return {
        container: container,
        width: container.clientWidth || 800,
        height: container.clientHeight || 600,
        renderer: 'canvas', // G6 5.x默认使用canvas
        autoFit: 'view', // 替代fitView
        padding: isMobileDevice ? [20, 20, 20, 20] : [30, 30, 30, 30], // 替代fitViewPadding

        // 节点默认样式
        node: {
            style: {
                size: isMobileDevice ? [180, 120] : [220, 120]
            }
        },

        // 边默认样式
        edge: {
            style: {
                stroke: '#1890ff',
                lineWidth: 2,
                opacity: 0.8,
                endArrow: {
                    type: 'vee',
                    size: 10,
                    fill: '#1890ff'
                }
            }
        },

        // 布局配置
        layout: {
            type: 'dagre',
            rankdir: objdata.pointType === 'H5' ? 'TB' : 'LR',
            align: 'DL',
            nodesep: isMobileDevice ? 60 : 80,
            ranksep: isMobileDevice ? 80 : 120
        },

        // 行为配置
        behaviors: isMobileDevice ? [
            'drag-canvas',
            'zoom-canvas'
        ] : [
            'drag-canvas',
            'zoom-canvas',
            'drag-element'
        ],

        // 缩放范围
        zoomRange: [0.2, 3],

        // 动画配置
        animation: {
            duration: 300,
            easing: 'easePolyOut'
        }
    };
}

/**
 * 绑定G6 5.x版本的图表事件
 */
function bindGraphEventsV5(graph) {
    // 节点点击事件
    graph.on('node:click', function(e) {
        // 避免拖拽时触发点击
        const timeSinceDragStart = Date.now() - objdata.dragStartTime;
        if (objdata.isDragging && timeSinceDragStart > 200) return;

        const nodeId = e.itemId;
        const nodeData = objdata.allNodeData.find(node => node.id.toString() === nodeId);

        if (!nodeData) return;

        // 检查权限
        const hasPermission = checkNodePermission(nodeData);
        if (!hasPermission) {
            layer.msg('您没有权限访问此节点');
            return;
        }

        // 检查节点状态
        if (nodeData.status !== 0) {
            layer.msg('该节点暂不可用');
            return;
        }

        selectedNode(nodeData, e.item);
    });

    // 拖拽事件处理
    graph.on('element:dragstart', function() {
        objdata.isDragging = true;
        objdata.dragStartTime = Date.now();
    });

    graph.on('element:dragend', function() {
        setTimeout(() => {
            objdata.isDragging = false;
        }, 150);
    });

    // 画布拖拽优化
    graph.on('canvas:dragstart', function() {
        objdata.isDragging = true;
    });

    graph.on('canvas:dragend', function() {
        setTimeout(() => {
            objdata.isDragging = false;
        }, 100);
    });

    // 移动端特殊处理
    if (objdata.isTouch) {
        // 双击缩放处理
        let lastTapTime = 0;
        graph.on('canvas:click', function(e) {
            const currentTime = Date.now();
            const tapLength = currentTime - lastTapTime;
            if (tapLength < 500 && tapLength > 0) {
                // 双击缩放
                const point = graph.getPointByClient(e.client.x, e.client.y);
                const currentZoom = graph.getZoom();
                const targetZoom = currentZoom < 1.5 ? 2 : 1;
                graph.zoomTo(targetZoom, point);
            }
            lastTapTime = currentTime;
        });
    }
}

/**
 * 工具函数区域
 */

/**
 * 检查用户是否有权限访问节点
 */
function checkNodePermission(nodeData) {
    if (!nodeData.applicable_end && !nodeData.applicable_role) {
        return true;
    }
    if (nodeData.applicable_end === '全部' && nodeData.applicable_role === '全部') {
        return true;
    }

    let hasEndPermission = true;
    let hasRolePermission = true;

    // 检查端权限
    if (nodeData.applicable_end) {
        const nodeEnds = nodeData.applicable_end.split(',').map(item => item.trim());
        hasEndPermission = nodeEnds.some(end => objdata.applicable.applicable_end.includes(end));
    }

    // 检查角色权限
    if (nodeData.applicable_role) {
        const nodeRoles = nodeData.applicable_role.split(',').map(item => item.trim());
        hasRolePermission = nodeRoles.some(role => objdata.applicable.applicable_role.includes(role));
    }

    return hasEndPermission && hasRolePermission;
}

/**
 * 获取插件类型配置
 */
function getPluginTypeConfig(pluginType) {
    return PLUGIN_TYPES[pluginType] || PLUGIN_TYPES.default;
}

/**
 * 判断是否应该显示logo图片
 */
function shouldShowLogo(nodeData) {
    // 如果pld为0且logo为空或0，显示默认图片
    if (nodeData.pld === 0 && nodeData.logo === '') {
        return { showLogo: true, logoPath: DEFAULT_LOGO_PATH };
    }

    // 如果logo不是纯数字，显示自定义logo
    if (nodeData.logo && !nodeData.logo.toString().match(/^\d+$/)) {
        return { showLogo: true, logoPath: ossPrefix + nodeData.logo };
    }

    return { showLogo: false, logoPath: null };
}

/**
 * 检测编程语言类型
 */
function detectProgrammingLanguage(content) {
    if (!content) return 'text';

    const lowercaseContent = content.toLowerCase();

    // JavaScript/TypeScript
    if (lowercaseContent.includes('function') || lowercaseContent.includes('const ') ||
        lowercaseContent.includes('let ') || lowercaseContent.includes('var ') ||
        lowercaseContent.includes('=>') || lowercaseContent.includes('console.log')) {
        return 'javascript';
    }

    // Python
    if (lowercaseContent.includes('def ') || lowercaseContent.includes('import ') ||
        lowercaseContent.includes('print(') || lowercaseContent.includes('if __name__')) {
        return 'python';
    }

    // HTML
    if (lowercaseContent.includes('<html') || lowercaseContent.includes('<!doctype') ||
        lowercaseContent.includes('<div') || lowercaseContent.includes('<body')) {
        return 'html';
    }

    // CSS
    if (lowercaseContent.includes('{') && lowercaseContent.includes(':') &&
        lowercaseContent.includes(';') && (lowercaseContent.includes('color') ||
            lowercaseContent.includes('background') || lowercaseContent.includes('margin'))) {
        return 'css';
    }

    // SQL
    if (lowercaseContent.includes('select ') || lowercaseContent.includes('insert ') ||
        lowercaseContent.includes('update ') || lowercaseContent.includes('delete ')) {
        return 'sql';
    }

    // JSON
    if ((lowercaseContent.trim().startsWith('{') && lowercaseContent.trim().endsWith('}')) ||
        (lowercaseContent.trim().startsWith('[') && lowercaseContent.trim().endsWith(']'))) {
        try {
            JSON.parse(content);
            return 'json';
        } catch (e) {
            // Not valid JSON
        }
    }

    return 'text';
}

/**
 * HTML转义函数
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

/**
 * 颜色调整函数
 */
function adjustColor(color, percent) {
    const num = parseInt(color.replace("#",""), 16),
        amt = Math.round(2.55 * percent),
        R = (num >> 16) + amt,
        B = (num >> 8 & 0x00FF) + amt,
        G = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R<255?R<1?0:R:255)*0x10000 + (B<255?B<1?0:B:255)*0x100 + (G<255?G<1?0:G:255)).toString(16).slice(1);
}

/**
 * 选择节点处理函数
 */
function selectedNode(nodeData, nodeItem) {
    // 记录节点被点击过
    objdata.clickedNodes.add(nodeData.id.toString());

    // 更新选中状态
    if (objdata.currentGraph && nodeItem) {
        // 重置所有节点样式
        objdata.currentGraph.getAllNodesData().forEach(node => {
            objdata.currentGraph.updateNodeData(node.id, {
                style: {
                    ...node.style,
                    stroke: '#e8e8e8',
                    lineWidth: 1
                }
            });
        });

        // 高亮当前选中节点
        objdata.currentGraph.updateNodeData(nodeData.id.toString(), {
            style: {
                stroke: '#1890ff',
                lineWidth: 3
            }
        });

        setTimeout(() => {
            objdata.currentGraph.draw();
        }, 100);
    }

    // 存储点击日志
    saveNodeClickLog(nodeData);

    // 跳转处理根据不同类型节点进行不同操作
    handleNodeAction(nodeData);

    // 显示节点详情
    showNodeDetails(nodeData);
}

/**
 * 存储节点点击日志
 */
function saveNodeClickLog(nodeData) {
    $.sm(function (re, err) {
        if (err) {
            console.log(err);
        } else {
            console.log(re);
        }
    }, ["node_click_log.add", JSON.stringify({
        agent_id: nodeData.agent_id,
        node_id: nodeData.id,
        oprid: "",
    })]);
}

/**
 * 根据节点类型处理不同的操作
 */
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
            // Code类型节点优先显示代码详情，也可以支持URL跳转
            if (nodeData.url) {
                layer.confirm('是否要跳转到代码编辑器？', {
                    icon: 3,
                    title: '代码节点'
                }, function(index) {
                    // window.open(nodeData.url, '_blank');
                    layer.close(index);
                }, function() {
                    showCodeDetails(nodeData);
                });
            } else {
                showCodeDetails(nodeData);
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

/**
 * 显示节点详情 - 可扩展功能
 */
function showNodeDetails(nodeData) {
    // 可以在这里实现节点详情弹窗等功能
    console.log('节点详情:', nodeData);
}

/**
 * 显示代码详情 - 支持HTML内容显示（解决TODO问题的核心函数）
 */
function showCodeDetails(nodeData) {
    const content = nodeData.content || '// 暂无代码内容';
    const isHtml = isHtmlContent(content);
    const language = detectProgrammingLanguage(content) || 'javascript';

    // 创建独立的代码查看页面内容
    const codeViewerHtml = createCodeViewerPage(nodeData, content, language, isHtml);

    // 使用layer打开代码查看器
    const layerIndex = layer.open({
        type: 1,
        title: `代码节点 - ${nodeData.node_name || '未命名'}`,
        area: (objdata.pointType === 'H5' || objdata.isMobile) ? ['95%', '85%'] : ['80%', '75%'],
        maxmin: true,
        content: codeViewerHtml,
        success: function(layero, index) {
            // 代码高亮处理（如果有相关库的话）
            initCodeHighlight(layero);

            // 绑定代码查看器内的事件
            bindCodeViewerEvents(layero, nodeData);
        }
    });
}

/**
 * 创建独立的代码查看器页面内容
 */
function createCodeViewerPage(nodeData, content, language, isHtml) {
    const pluginConfig = getPluginTypeConfig(nodeData.plugin_type);

    return `
        <div class="code-viewer-container" style="
            height: 100%;
            display: flex;
            flex-direction: column;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            background: #f8f9fa;
        ">
            <!-- 代码查看器头部 -->
            <div class="code-viewer-header" style="
                padding: 16px 20px;
                background: linear-gradient(135deg, ${pluginConfig.bgColor} 0%, ${adjustColor(pluginConfig.bgColor, -10)} 100%);
                border-bottom: 2px solid ${pluginConfig.borderColor};
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-shrink: 0;
            ">
                <div class="code-info" style="display: flex; align-items: center; gap: 12px;">
                    <span class="code-icon" style="font-size: 24px;">💻</span>
                    <div>
                        <h3 style="margin: 0; color: #2c3e50; font-size: 16px; font-weight: 600;">
                            ${nodeData.node_name || '代码节点'}
                        </h3>
                        <p style="margin: 2px 0 0 0; color: #666; font-size: 12px;">
                            语言: ${language.toUpperCase()} | 长度: ${content.length} 字符
                        </p>
                    </div>
                </div>
                
                <div class="code-actions" style="display: flex; gap: 8px;">
                    <button class="btn-copy" onclick="copyCodeContent()" style="
                        padding: 6px 12px;
                        background: ${pluginConfig.textColor};
                        color: #fff;
                        border: none;
                        border-radius: 4px;
                        font-size: 12px;
                        cursor: pointer;
                        transition: all 0.2s;
                    " onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                        📋 复制
                    </button>
                    
                    ${nodeData.url ? `
                    <button class="btn-edit" onclick="openCodeEditor()" style="
                        padding: 6px 12px;
                        background: #52c41a;
                        color: #fff;
                        border: none;
                        border-radius: 4px;
                        font-size: 12px;
                        cursor: pointer;
                        transition: all 0.2s;
                    " onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
                        ✏️ 编辑
                    </button>
                    ` : ''}
                </div>
            </div>
            
            <!-- 代码内容区域 -->
            <div class="code-viewer-content" style="
                flex: 1;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            ">
                ${isHtml ? `
                <!-- HTML预览和代码切换标签 -->
                <div class="code-tabs" style="
                    display: flex;
                    background: #fff;
                    border-bottom: 1px solid #e1e8ed;
                    flex-shrink: 0;
                ">
                    <button class="tab-btn active" data-tab="code" onclick="switchCodeTab('code')" style="
                        padding: 12px 20px;
                        border: none;
                        background: #fff;
                        color: #2c3e50;
                        cursor: pointer;
                        border-bottom: 2px solid ${pluginConfig.textColor};
                        font-weight: 600;
                    ">
                        📝 代码
                    </button>
                    <button class="tab-btn" data-tab="preview" onclick="switchCodeTab('preview')" style="
                        padding: 12px 20px;
                        border: none;
                        background: #f8f9fa;
                        color: #666;
                        cursor: pointer;
                        border-bottom: 2px solid transparent;
                    ">
                        👁️ 预览
                    </button>
                </div>
                ` : ''}
                
                <!-- 代码显示区域 -->
                <div class="tab-content code-content active" style="
                    flex: 1;
                    overflow: auto;
                    background: #2d3748;
                    color: #e2e8f0;
                    padding: 20px;
                ">
                    <pre style="
                        margin: 0;
                        font-size: 13px;
                        line-height: 1.6;
                        white-space: pre-wrap;
                        word-wrap: break-word;
                    "><code id="code-content" class="language-${language}">${escapeHtml(content)}</code></pre>
                </div>
                
                ${isHtml ? `
                <!-- HTML预览区域 -->
                <div class="tab-content preview-content" style="
                    flex: 1;
                    overflow: auto;
                    background: #fff;
                    padding: 20px;
                    display: none;
                ">
                    <div class="html-preview-container" style="
                        border: 1px solid #e1e8ed;
                        border-radius: 8px;
                        overflow: hidden;
                    ">
                        <div class="preview-header" style="
                            padding: 8px 12px;
                            background: #f8f9fa;
                            border-bottom: 1px solid #e1e8ed;
                            font-size: 12px;
                            color: #666;
                        ">
                            HTML 预览效果
                        </div>
                        <div class="preview-body" style="padding: 16px;">
                            ${content}
                        </div>
                    </div>
                </div>
                ` : ''}
            </div>
            
            <!-- 状态栏 -->
            <div class="code-viewer-footer" style="
                padding: 8px 20px;
                background: #fff;
                border-top: 1px solid #e1e8ed;
                font-size: 11px;
                color: #666;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-shrink: 0;
            ">
                <span>节点ID: ${nodeData.id} | 插件类型: ${nodeData.plugin_type}</span>
                <span>${new Date().toLocaleString()}</span>
            </div>
        </div>
        
        <!-- 内置样式和脚本 -->
        <style>
            .code-viewer-container .tab-btn.active {
                background: #fff !important;
                color: #2c3e50 !important;
                border-bottom-color: ${pluginConfig.textColor} !important;
                font-weight: 600;
            }
            
            .code-viewer-container .tab-content {
                display: none;
            }
            
            .code-viewer-container .tab-content.active {
                display: flex !important;
                flex-direction: column;
            }
            
            .code-viewer-container pre code {
                font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace !important;
            }
            
            .code-viewer-container .btn-copy:hover,
            .code-viewer-container .btn-edit:hover {
                transform: translateY(-1px);
                box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            }
        </style>
        
        <script>
            // 代码查看器内置脚本
            window.currentNodeData = ${JSON.stringify(nodeData)};
            
            function switchCodeTab(tabName) {
                // 切换标签按钮状态
                document.querySelectorAll('.tab-btn').forEach(btn => {
                    btn.classList.remove('active');
                    btn.style.background = '#f8f9fa';
                    btn.style.color = '#666';
                    btn.style.borderBottomColor = 'transparent';
                });
                
                document.querySelector('[data-tab="' + tabName + '"]').classList.add('active');
                
                // 切换内容区域
                document.querySelectorAll('.tab-content').forEach(content => {
                    content.style.display = 'none';
                    content.classList.remove('active');
                });
                
                const targetContent = document.querySelector('.' + tabName + '-content');
                if (targetContent) {
                    targetContent.style.display = 'flex';
                    targetContent.classList.add('active');
                }
            }
            
            function copyCodeContent() {
                const codeElement = document.getElementById('code-content');
                if (codeElement) {
                    const textArea = document.createElement('textarea');
                    textArea.value = codeElement.textContent;
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    
                    // 临时修改按钮文本
                    const btn = document.querySelector('.btn-copy');
                    const originalText = btn.innerHTML;
                    btn.innerHTML = '✅ 已复制';
                    setTimeout(() => {
                        btn.innerHTML = originalText;
                    }, 2000);
                }
            }
            
            function openCodeEditor() {
                if (window.currentNodeData && window.currentNodeData.url) {
                    window.open(window.currentNodeData.url, '_blank');
                }
            }
        </script>
    `;
}

/**
 * 检测是否为HTML内容
 */
function isHtmlContent(content) {
    if (!content) return false;
    const htmlRegex = /<[^>]+>/;
    return htmlRegex.test(content);
}

/**
 * 初始化代码高亮（如果有相关库）
 */
function initCodeHighlight(layero) {
    // 这里可以集成Prism.js或highlight.js等代码高亮库
    // 例如：Prism.highlightAll();
}

/**
 * 绑定代码查看器内的事件
 */
function bindCodeViewerEvents(layero, nodeData) {
    // 可以在这里绑定代码查看器内的特殊事件
    // 比如键盘快捷键、右键菜单等
}

/**
 * 显示函数详情
 */
function showFunctionDetails(nodeData) {
    const content = `
        <div style="padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
            <div style="margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid #f0f0f0;">
                <h3 style="margin: 0; color: #2c3e50; font-size: 18px; font-weight: 600;">
                    🔧 函数节点详情
                </h3>
            </div>
            
            <div style="display: grid; grid-template-columns: 120px 1fr; gap: 16px; margin-bottom: 16px;">
                <strong style="color: #666;">节点名称：</strong>
                <span>${nodeData.node_name || '未命名'}</span>
                
                <strong style="color: #666;">函数名称：</strong>
                <span>${nodeData.function_name || nodeData.func_name || '未指定'}</span>
                
                <strong style="color: #666;">节点ID：</strong>
                <span>${nodeData.id}</span>
                
                <strong style="color: #666;">状态：</strong>
                <span style="
                    padding: 2px 8px; 
                    border-radius: 4px; 
                    font-size: 12px;
                    background: ${nodeData.status === 0 ? '#f6ffed' : '#fff2e8'};
                    color: ${nodeData.status === 0 ? '#52c41a' : '#fa8c16'};
                    border: 1px solid ${nodeData.status === 0 ? '#b7eb8f' : '#ffd591'};
                ">
                    ${nodeData.status === 0 ? '✅ 可用' : '⚠️ 禁用'}
                </span>
            </div>
            
            <div style="margin-top: 20px;">
                <strong style="color: #666; display: block; margin-bottom: 8px;">函数描述：</strong>
                <div style="
                    background: #f8f9fa; 
                    padding: 16px; 
                    border-radius: 6px; 
                    border-left: 4px solid #722ed1;
                    max-height: 200px; 
                    overflow-y: auto;
                    line-height: 1.6;
                ">
                    ${nodeData.content || nodeData.description || '暂无函数描述'}
                </div>
            </div>
        </div>
    `;

    layer.open({
        type: 1,
        title: false,
        area: (objdata.pointType === 'H5' || objdata.isMobile) ? ['90%', '60%'] : ['500px', '350px'],
        content: content
    });
}

/**
 * 图表响应式处理
 */
function initGraphResize(graph) {
    const resizeHandler = () => {
        if (!graph || graph.destroyed) return;

        const container = document.getElementById('nodeGraphContainer');
        if (!container || !container.clientWidth || !container.clientHeight) return;

        graph.setSize(container.clientWidth, container.clientHeight);
        graph.fitView();
    };

    window.addEventListener('resize', resizeHandler);

    // 页面卸载时清理
    $(window).on('beforeunload', function() {
        window.removeEventListener('resize', resizeHandler);
        if (graph && !graph.destroyed) {
            graph.destroy();
        }
    });
}

/**
 * 初始化事件监听器
 */
function initEventListeners() {
    // 窗口大小改变时重新计算布局
    $(window).on('resize', function() {
        if (objdata.currentGraph && !objdata.currentGraph.destroyed) {
            const container = document.getElementById('nodeGraphContainer');
            if (container) {
                objdata.currentGraph.setSize(container.clientWidth, container.clientHeight);
                objdata.currentGraph.fitView();
            }
        }
    });
}

/**
 * 页面状态管理函数
 */
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