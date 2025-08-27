## 代码留影

对一些有重大变革或者需要重构的代码的留影 

表示曾经达到过

### graph.js

```js
/**
 * 作者：gongxi
 * 时间：2025-08-13
 * 说明：独立的节点流程图页面
 * 功能：节点关系图显示、添加子节点、刷新数据等
 */
require.config({
    paths: {
        jquery: '../../sys/jquery',
        system: '../../sys/system',
        layui: "../../layui-btkj/layui",
        layuicommon: "../../sys/layuicommon",
        // 添加 AntV G6 依赖
        g6: "../../plugin/antv/g6/g6.min"
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

// 页面数据对象
var objdata = {
    agent_id: null,
    allNodeData: [],
    currentGraph: null,
    nodeRelationDataHTML: null
};

require(["jquery", "system", "layui", "g6"], function () {
    layui.use(['layer', 'form'], function () {
        var layer = layui.layer;
        var form = layui.form;

        // 获取参数
        objdata.agent_id = Arg("agent_id") || Arg("id");

        if (!objdata.agent_id) {
            layer.msg('缺少必要参数：agent_id');
            return;
        }

        // 初始化页面
        initPage();
        // 添加节点按钮  TODO 有小bug  如何得到智能体id 点击html节点流程图按钮的时候
        $("#addNodeBtn").click(function() {
            layer.open({
                type: 2,
                title: "添加智能体节点",
                area: ['620px', '700px'],
                content: 'html/agent/node_add_edit.html?v=' + Arg("v") + '&type=' + "add" + '&mid=' + Arg("mid") + "&id=" + objdata.agent_id,
                success: function (layero, index) {
                    // 可以在这里设置默认的父节点ID
                },
                btn: ["保存", "取消"],
                yes: function (index, layero) {
                    let w = layero.find('iframe')[0].contentWindow;
                    w.$("#saveOK").trigger("click", function () {
                        layer.close(index);
                        layer.msg("子节点添加成功！");

                        // 延迟刷新图表，确保数据已更新
                        setTimeout(() => {
                            loadAllNodeData().then(() => {
                                refreshCurrentGraph();
                            });
                        }, 800);
                    });
                },
                no: function (index, layero) {
                    layer.close(index);
                }
            });
        })

        // 绑定工具栏按钮事件
        bindToolbarEvents();

    });

    // 初始化页面
    function initPage() {
        // 显示加载状态
        showLoading();

        // 加载节点数据并渲染图表
        loadAllNodeData().then(() => {
            hideLoading();
            if (!objdata.nodeRelationDataHTML || objdata.nodeRelationDataHTML.nodes.length === 0) {
                showEmptyState();
                return;
            }

            // 动态加载 G6 库并创建关系图
            require(['g6'], function(G6) {
                createNodeRelationGraphHTML(G6, objdata.nodeRelationDataHTML);
            });
        }).catch((error) => {
            hideLoading();
            layui.layer.msg('获取节点数据失败，请重试');
            console.error('获取节点数据失败:', error);
        });
    }

    // 绑定工具栏按钮事件
    function bindToolbarEvents() {
        var layer = layui.layer;

        // 刷新数据按钮
        $("#refreshGraphBtn").click(function() {
            const btn = $(this);
            btn.addClass('layui-btn-disabled').html('<i class="layui-icon layui-icon-loading layui-anim layui-anim-rotate layui-anim-loop"></i> 刷新中');

            loadAllNodeData().then(() => {
                if (objdata.currentGraph && !objdata.currentGraph.destroyed) {
                    const newData = prepareRelationDataHTML(objdata.allNodeData);
                    objdata.currentGraph.changeData(newData);

                    setTimeout(() => {
                        objdata.currentGraph.layout();
                        objdata.currentGraph.fitView(30);
                        btn.removeClass('layui-btn-disabled').html('<i class="layui-icon layui-icon-refresh"></i> 刷新数据');
                        layer.msg('图表已刷新');
                        updateNodeCount();
                    }, 300);
                }
            }).catch((error) => {
                btn.removeClass('layui-btn-disabled').html('<i class="layui-icon layui-icon-refresh"></i> 刷新数据');
                layer.msg('刷新失败，请重试');
                console.error('刷新失败:', error);
            });
        });

        // 适应画布按钮
        $("#fitGraphBtn").click(function() {
            if (objdata.currentGraph && !objdata.currentGraph.destroyed) {
                objdata.currentGraph.fitView(30);
                objdata.currentGraph.fitCenter();
                layer.msg('已适应画布');
            }
        });

        // 重置布局按钮
        $("#resetLayoutBtn").click(function() {
            if (objdata.currentGraph && !objdata.currentGraph.destroyed) {
                objdata.currentGraph.layout();
                setTimeout(() => {
                    objdata.currentGraph.fitView(30);
                }, 500);
                layer.msg('布局已重置');
            }
        });

        // 导出图片按钮
        $("#exportGraphBtn").click(function() {
            showExportDialog();
        });

        // 返回列表按钮
        $("#backToListBtn").click(function() {
            // 关闭当前窗口或跳转回列表页
            var index = parent.layer.getFrameIndex(window.name);
            if (index) {
                parent.layer.close(index);
            } else {
                // 如果不是在弹窗中，则跳转回列表页
                window.location.href = 'node_list.html?v=' + Arg("v") + '&mid=' + Arg("mid") + '&id=' + objdata.agent_id;
            }
        });
    }

    // 加载所有节点数据
    function loadAllNodeData() {
        return new Promise((resolve, reject) => {
            $.sm(function (re, err) {
                if (err) {
                    reject(err);
                } else {
                    console.log('获取节点数据成功:', re);
                    objdata.allNodeData = re || [];
                    objdata.nodeRelationDataHTML = prepareRelationDataHTML(objdata.allNodeData);
                    resolve(re);
                }
            }, ["w_agent_node.selectById", $.msgwhere({"agent_id": [objdata.agent_id]})]);
        });
    }

    // HTML节点数据准备函数
    function prepareRelationDataHTML(nodeList) {
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

        // 生成节点数据 - 使用HTML节点
        nodeList.forEach(node => {
            nodes.push({
                id: node.id.toString(),
                label: node.node_name || `节点${node.id}`,
                type: 'html-node',
                size: [280, 120],
                style: {
                    fill: 'transparent',
                    stroke: 'transparent'
                },
                nodeData: node
            });
        });

        // 生成边数据（基于parent_id关系）
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

    // 创建节点关系图
    function createNodeRelationGraphHTML(G6, data) {
        const container = document.getElementById('nodeGraphContainer');

        if (!container) {
            layui.layer.msg('图表容器未找到');
            return;
        }

        // 注册自定义HTML节点
        G6.registerNode('html-node', {
            draw(cfg, group) {
                const nodeData = cfg.nodeData;
                const size = cfg.size || [280, 120];
                const width = size[0];
                const height = size[1];

                // 根据状态确定节点颜色
                const isDisabled = nodeData.status !== 0;
                const nodeColor = isDisabled ? '#d9d9d9' : getNodeColor(nodeData.node_type);

                // 创建外部容器
                const rect = group.addShape('rect', {
                    attrs: {
                        x: -width / 2,
                        y: -height / 2,
                        width: width,
                        height: height,
                        fill: nodeColor,
                        stroke: '#666',
                        strokeWidth: 1,
                        radius: 8,
                        cursor: 'pointer',
                        shadowColor: 'rgba(0,0,0,0.15)',
                        shadowBlur: 6,
                        shadowOffsetX: 2,
                        shadowOffsetY: 2
                    },
                    name: 'main-rect'
                });

                // 添加节点标题
                group.addShape('text', {
                    attrs: {
                        x: 0,
                        y: -35,
                        text: cfg.label,
                        fontSize: 14,
                        fontWeight: 'bold',
                        fill: isDisabled ? '#999' : '#fff',
                        textAlign: 'center',
                        textBaseline: 'middle',
                        cursor: 'pointer'
                    },
                    name: 'title-text'
                });

                // 添加节点类型标签
                const nodeTypeText = getNodeTypeText(nodeData.node_type);
                group.addShape('rect', {
                    attrs: {
                        x: -width/2 + 5,
                        y: -height/2 + 5,
                        width: 45,
                        height: 18,
                        fill: isDisabled ? 'rgba(153,153,153,0.2)' : 'rgba(255,255,255,0.2)',
                        radius: 3,
                        cursor: 'pointer'
                    },
                    name: 'type-bg'
                });

                group.addShape('text', {
                    attrs: {
                        x: -width/2 + 27.5,
                        y: -height/2 + 14,
                        text: nodeTypeText,
                        fontSize: 10,
                        fill: isDisabled ? '#666' : '#fff',
                        textAlign: 'center',
                        textBaseline: 'middle',
                        cursor: 'pointer'
                    },
                    name: 'type-text'
                });

                // 添加状态指示器
                const statusColor = nodeData.status === 0 ? '#52c41a' : '#f5222d';
                group.addShape('circle', {
                    attrs: {
                        x: width / 2 - 15,
                        y: -height / 2 + 15,
                        r: 6,
                        fill: statusColor,
                        stroke: '#fff',
                        strokeWidth: 2,
                        cursor: 'pointer'
                    },
                    name: 'status-circle'
                });

                // 添加适用终端信息（替换原来的描述）
                if (nodeData.applicable_end && nodeData.applicable_end.trim()) {
                    const applicableEnd = nodeData.applicable_end.length > 20
                        ? nodeData.applicable_end.substring(0, 20) + '...'
                        : nodeData.applicable_end;
                    group.addShape('text', {
                        attrs: {
                            x: -width/2 + 10,
                            y: -5,
                            text: `适用: ${applicableEnd}`,
                            fontSize: 10,
                            fill: isDisabled ? '#888' : '#fff',
                            textAlign: 'left',
                            textBaseline: 'middle',
                            opacity: 0.9,
                            cursor: 'pointer'
                        },
                        name: 'applicable-end-text'
                    });
                }

                // 添加适用对象信息
                if (nodeData.applicable_role && nodeData.applicable_role.trim()) {
                    const applicableRole = nodeData.applicable_role.length > 20
                        ? nodeData.applicable_role.substring(0, 20) + '...'
                        : nodeData.applicable_role;
                    group.addShape('text', {
                        attrs: {
                            x: -width/2 + 10,
                            y: 15,
                            text: `对象: ${applicableRole}`,
                            fontSize: 10,
                            fill: isDisabled ? '#888' : '#fff',
                            textAlign: 'left',
                            textBaseline: 'middle',
                            opacity: 0.9,
                            cursor: 'pointer'
                        },
                        name: 'applicable-role-text'
                    });
                }

                // 添加子节点按钮（禁用状态下不显示）
                if (!isDisabled) {
                    const addBtnGroup = group.addGroup({
                        name: 'add-btn-group'
                    });

                    addBtnGroup.addShape('rect', {
                        attrs: {
                            x: -width/2 + 5,
                            y: height/2 - 25,
                            width: 60,
                            height: 20,
                            fill: 'rgba(255,255,255,0.2)',
                            stroke: '#fff',
                            strokeWidth: 1,
                            radius: 3,
                            cursor: 'pointer',
                            opacity: 0.8
                        },
                        name: 'add-btn-bg'
                    });

                    addBtnGroup.addShape('text', {
                        attrs: {
                            x: -width/2 + 35,
                            y: height/2 - 15,
                            text: '+ 子节点',
                            fontSize: 10,
                            fill: '#fff',
                            textAlign: 'center',
                            textBaseline: 'middle',
                            cursor: 'pointer'
                        },
                        name: 'add-btn-text'
                    });
                }

                // 查看详情按钮
                const detailBtnGroup = group.addGroup({
                    name: 'detail-btn-group'
                });

                detailBtnGroup.addShape('rect', {
                    attrs: {
                        x: width/2 - 50,
                        y: height/2 - 25,
                        width: 45,
                        height: 20,
                        fill: isDisabled ? 'rgba(153,153,153,0.2)' : 'rgba(255,255,255,0.2)',
                        stroke: isDisabled ? '#999' : '#fff',
                        strokeWidth: 1,
                        radius: 3,
                        cursor: 'pointer',
                        opacity: 0.8
                    },
                    name: 'detail-btn-bg'
                });

                detailBtnGroup.addShape('text', {
                    attrs: {
                        x: width/2 - 27.5,
                        y: height/2 - 15,
                        text: '详情',
                        fontSize: 10,
                        fill: isDisabled ? '#666' : '#fff',
                        textAlign: 'center',
                        textBaseline: 'middle',
                        cursor: 'pointer'
                    },
                    name: 'detail-btn-text'
                });

                return rect;
            },

            // 更新节点
            update(cfg, item) {
                const group = item.getContainer();
                const nodeData = cfg.nodeData;
                const isDisabled = nodeData.status !== 0;
                const nodeColor = isDisabled ? '#d9d9d9' : getNodeColor(nodeData.node_type);

                // 更新主要形状颜色
                const rect = group.find(element => element.get('name') === 'main-rect');
                if (rect) {
                    rect.attr('fill', nodeColor);
                }

                // 更新标题文本
                const titleText = group.find(element => element.get('name') === 'title-text');
                if (titleText) {
                    titleText.attr('text', cfg.label);
                    titleText.attr('fill', isDisabled ? '#999' : '#fff');
                }

                // 更新类型文本
                const typeText = group.find(element => element.get('name') === 'type-text');
                if (typeText) {
                    typeText.attr('text', getNodeTypeText(nodeData.node_type));
                    typeText.attr('fill', isDisabled ? '#666' : '#fff');
                }

                // 更新状态
                const statusCircle = group.find(element => element.get('name') === 'status-circle');
                if (statusCircle) {
                    const statusColor = nodeData.status === 0 ? '#52c41a' : '#f5222d';
                    statusCircle.attr('fill', statusColor);
                }

                // 更新适用终端文本
                const applicableEndText = group.find(element => element.get('name') === 'applicable-end-text');
                if (applicableEndText && nodeData.applicable_end && nodeData.applicable_end.trim()) {
                    const applicableEnd = nodeData.applicable_end.length > 20
                        ? nodeData.applicable_end.substring(0, 20) + '...'
                        : nodeData.applicable_end;
                    applicableEndText.attr('text', `适用: ${applicableEnd}`);
                    applicableEndText.attr('fill', isDisabled ? '#888' : '#fff');
                }

                // 更新适用对象文本
                const applicableRoleText = group.find(element => element.get('name') === 'applicable-role-text');
                if (applicableRoleText && nodeData.applicable_role && nodeData.applicable_role.trim()) {
                    const applicableRole = nodeData.applicable_role.length > 20
                        ? nodeData.applicable_role.substring(0, 20) + '...'
                        : nodeData.applicable_role;
                    applicableRoleText.attr('text', `对象: ${applicableRole}`);
                    applicableRoleText.attr('fill', isDisabled ? '#888' : '#fff');
                }
            }
        });

        // 创建 G6 图实例
        const graph = new G6.Graph({
            container: container,
            width: container.clientWidth,
            height: container.clientHeight,
            renderer: 'canvas',
            pixelRatio: window.devicePixelRatio || 2,
            modes: {
                default: [
                    'drag-canvas',
                    'zoom-canvas',
                    'drag-node'
                ]
            },
            defaultNode: {
                type: 'html-node',
                size: [280, 120],
                style: {
                    fill: 'transparent',
                    stroke: 'transparent'
                }
            },
            defaultEdge: {
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
            },
            layout: {
                type: 'dagre',
                rankdir: 'TB',
                align: 'DL',
                nodesep: 60,
                ranksep: 100,
                controlPoints: true,
                sortByCombo: false
            },
            fitView: true,
            fitViewPadding: [40, 40, 40, 40],
            animate: true,
            animateCfg: {
                duration: 300,
                easing: 'easeLinear'
            }
        });

        // 存储图表实例
        objdata.currentGraph = graph;

        // 绑定节点点击事件
        graph.on('node:click', (e) => {
            const nodeData = e.item.getModel().nodeData;
            const shape = e.target;
            const shapeName = shape.get('name');
            const group = e.item.getContainer();

            // 点击添加子节点按钮（只有启用状态的节点才能添加子节点）
            if (nodeData.status === 0 && (shapeName === 'add-btn-bg' || shapeName === 'add-btn-text' ||
                (group.find(element => element.get('name') === 'add-btn-group') &&
                    group.find(element => element.get('name') === 'add-btn-group').contain(shape)))) {
                e.stopPropagation();
                addChildNode(nodeData.id, nodeData.node_name);
                return;
            }

            // 点击查看详情按钮
            if (shapeName === 'detail-btn-bg' || shapeName === 'detail-btn-text' ||
                (group.find(element => element.get('name') === 'detail-btn-group') &&
                    group.find(element => element.get('name') === 'detail-btn-group').contain(shape))) {
                e.stopPropagation();
                showNodeDetail(nodeData);
                return;
            }

            // 默认显示节点详情
            showNodeDetail(nodeData);
        });

        // 节点悬停效果
        graph.on('node:mouseenter', (e) => {
            const item = e.item;
            const group = item.getContainer();
            const nodeData = item.getModel().nodeData;
            const isDisabled = nodeData.status !== 0;

            const rect = group.find(element => element.get('name') === 'main-rect');
            if (rect) {
                rect.attr('strokeWidth', 2);
                rect.attr('stroke', isDisabled ? '#999' : '#1890ff');

                // 高亮按钮（仅启用状态）
                if (!isDisabled) {
                    const addBtnGroup = group.find(element => element.get('name') === 'add-btn-group');
                    if (addBtnGroup) {
                        addBtnGroup.get('children').forEach(child => {
                            if (child.get('name') === 'add-btn-bg') {
                                child.attr('opacity', 1);
                                child.attr('fill', 'rgba(24, 144, 255, 0.3)');
                            }
                        });
                    }
                }

                const detailBtnGroup = group.find(element => element.get('name') === 'detail-btn-group');
                if (detailBtnGroup) {
                    detailBtnGroup.get('children').forEach(child => {
                        if (child.get('name') === 'detail-btn-bg') {
                            child.attr('opacity', 1);
                            child.attr('fill', isDisabled ? 'rgba(153,153,153,0.3)' : 'rgba(24, 144, 255, 0.3)');
                        }
                    });
                }
            }
            graph.paint();
        });

        graph.on('node:mouseleave', (e) => {
            const item = e.item;
            const group = item.getContainer();
            const nodeData = item.getModel().nodeData;
            const isDisabled = nodeData.status !== 0;

            const rect = group.find(element => element.get('name') === 'main-rect');
            if (rect) {
                rect.attr('strokeWidth', 1);
                rect.attr('stroke', '#666');

                // 恢复按钮样式
                if (!isDisabled) {
                    const addBtnGroup = group.find(element => element.get('name') === 'add-btn-group');
                    if (addBtnGroup) {
                        addBtnGroup.get('children').forEach(child => {
                            if (child.get('name') === 'add-btn-bg') {
                                child.attr('opacity', 0.8);
                                child.attr('fill', 'rgba(255,255,255,0.2)');
                            }
                        });
                    }
                }

                const detailBtnGroup = group.find(element => element.get('name') === 'detail-btn-group');
                if (detailBtnGroup) {
                    detailBtnGroup.get('children').forEach(child => {
                        if (child.get('name') === 'detail-btn-bg') {
                            child.attr('opacity', 0.8);
                            child.attr('fill', isDisabled ? 'rgba(153,153,153,0.2)' : 'rgba(255,255,255,0.2)');
                        }
                    });
                }
            }
            graph.paint();
        });

        // 渲染数据
        graph.data(data);
        graph.render();

        // 延迟执行自适应画布
        setTimeout(() => {
            graph.fitView(40);
            updateNodeCount();
        }, 800);

        // 窗口大小改变时重新调整
        const resizeHandler = () => {
            if (!graph || graph.destroyed) return;
            if (!container || !container.scrollWidth || !container.scrollHeight) return;
            graph.changeSize(container.scrollWidth, container.scrollHeight);
            graph.fitView(40);
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

    // 添加子节点函数
    function addChildNode(parentId, parentName) {
        var layer = layui.layer;

        layer.open({
            type: 2,
            title: `为节点 "${parentName}" 添加子节点`,
            shadeClose: false,
            area: ['620px', '700px'],
            content: 'node_add_edit.html?v=' + Arg("v") + '&type=addChildNode&mid=' + Arg("mid") + '&parent_id=' + parentId + '&agent_id=' + objdata.agent_id,
            success: function (layero, index) {
                // 可以在这里设置默认的父节点ID
            },
            btn: ["保存", "取消"],
            yes: function (index, layero) {
                let w = layero.find('iframe')[0].contentWindow;
                w.$("#saveOK").trigger("click", function () {
                    layer.close(index);
                    layer.msg("子节点添加成功！");

                    // 延迟刷新图表，确保数据已更新
                    setTimeout(() => {
                        loadAllNodeData().then(() => {
                            refreshCurrentGraph();
                        });
                    }, 800);
                });
            },
            no: function (index, layero) {
                layer.close(index);
            }
        });
    }

    // 显示节点详情
    function showNodeDetail(nodeData) {
        const layer = layui.layer;

        const content = `
            <div style="padding: 20px;">
                <table class="layui-table" lay-size="sm">
                    <tr><td><strong>节点ID：</strong></td><td>${nodeData.id}</td></tr>
                    <tr><td><strong>节点名称：</strong></td><td>${nodeData.node_name || '未命名'}</td></tr>
                    <tr><td><strong>节点类型：</strong></td><td>${getNodeTypeText(nodeData.node_type)}</td></tr>
                    <tr><td><strong>父节点：</strong></td><td>${nodeData.parent_id || '无'}</td></tr>
                    <tr><td><strong>插件ID：</strong></td><td>${nodeData.plugin_id || '无'}</td></tr>
                    <tr><td><strong>插件名称：</strong></td><td>${nodeData.plugin_name || '无'}</td></tr>
                    <tr><td><strong>适用终端：</strong></td><td>${nodeData.applicable_end || '无'}</td></tr>
                    <tr><td><strong>适用对象：</strong></td><td>${nodeData.applicable_role || '无'}</td></tr>
                    <tr><td><strong>URL：</strong></td><td style="word-break:break-all;">${nodeData.url || '无'}</td></tr>
                    <tr><td><strong>状态：</strong></td><td>${nodeData.status === 0 ? '<span style="color: green;">正常</span>' : '<span style="color: red;">停用</span>'}</td></tr>
                    <tr><td><strong>创建时间：</strong></td><td>${nodeData.creatime || '未知'}</td></tr>
                    <tr><td><strong>更新时间：</strong></td><td>${nodeData.altime || '未知'}</td></tr>
                </table>
            </div>
        `;

        layer.open({
            type: 1,
            title: '节点详情',
            area: ['600px', '500px'],
            content: content,
            btn: ['编辑节点', '关闭'],
            yes: function(index) {
                layer.close(index);
                editNode(nodeData.id);
            }
        });
    }

    // 编辑节点
    function editNode(nodeId) {
        var layer = layui.layer;

        layer.open({
            type: 2,
            title: "编辑节点",
            shadeClose: false,
            area: ['500px', '600px'],
            content: 'node_add_edit.html?v=' + Arg("v") + '&type=update&mid=' + Arg("mid") + "&id=" + nodeId,
            success: function (layero, index) {
            },
            btn: ["保存", "取消"],
            yes: function (index, layero) {
                let w = layero.find('iframe')[0].contentWindow;
                w.$("#saveOK").trigger("click", function () {
                    layer.close(index);
                    layer.msg("编辑成功！");

                    // 编辑后重新加载所有数据并刷新图表
                    setTimeout(() => {
                        loadAllNodeData().then(() => {
                            refreshCurrentGraph();
                        });
                    }, 500);
                });
            },
            no: function (index, layero) {
                layer.close(index);
            }
        });
    }

    // 刷新当前图表的函数
    function refreshCurrentGraph() {
        if (objdata.currentGraph && !objdata.currentGraph.destroyed) {
            const newData = prepareRelationDataHTML(objdata.allNodeData);
            objdata.currentGraph.changeData(newData);

            setTimeout(() => {
                objdata.currentGraph.layout();
                objdata.currentGraph.fitView(30);
                updateNodeCount();
            }, 300);
        }
    }

    // 获取节点类型文本
    function getNodeTypeText(nodeType) {
        const typeMap = {
            '1': '开始',
            '2': '处理',
            '3': '决策',
            '4': '结束',
            '5': '其他'
        };
        return typeMap[nodeType] || '未知';
    }

    // 根据节点类型返回不同颜色
    function getNodeColor(nodeType) {
        const colors = {
            '1': '#52c41a',     // 绿色 - 开始节点
            '2': '#1890ff',     // 蓝色 - 处理节点
            '3': '#fa8c16',     // 橙色 - 决策节点
            '4': '#f5222d',     // 红色 - 结束节点
            '5': '#722ed1'      // 紫色 - 其他
        };
        return colors[nodeType] || colors['5'];
    }

    // 显示加载状态
    function showLoading() {
        const loadingHtml = `
            <div class="loading-overlay" style="display: flex; align-items: center; justify-content: center; height: 100%; flex-direction: column; color: #999; position: absolute; top: 0; left: 0; width: 100%; background: rgba(255,255,255,0.9); z-index: 1000;">
                <i class="layui-icon layui-icon-loading layui-anim layui-anim-rotate layui-anim-loop" style="font-size: 48px; margin-bottom: 20px;"></i>
                <div style="font-size: 14px;">加载节点数据中...</div>
            </div>
        `;
        $('#nodeGraphContainer').html(loadingHtml);
    }

    // 隐藏加载状态
    function hideLoading() {
        $('.loading-overlay').remove();
    }

    // 显示空状态
    function showEmptyState() {
        const emptyHtml = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; flex-direction: column; color: #999;">
                <i class="layui-icon layui-icon-face-cry" style="font-size: 64px; margin-bottom: 20px;"></i>
                <h3 style="margin: 10px 0; font-size: 18px; color: #666;">暂无节点数据</h3>
                <p style="margin: 0; font-size: 14px; color: #999;">请先添加节点数据后再查看流程图</p>
            </div>
        `;
        $('#nodeGraphContainer').html(emptyHtml);
        $('#nodeCount').html('节点数量：0');
    }

    // 更新节点数量显示
    function updateNodeCount() {
        const count = objdata.allNodeData ? objdata.allNodeData.length : 0;
        const enabledCount = objdata.allNodeData ? objdata.allNodeData.filter(node => node.status === 0).length : 0;
        const disabledCount = count - enabledCount;

        $('#nodeCount').html(`节点数量：${count} (正常: ${enabledCount}, 停用: ${disabledCount})`);
    }

    // 显示导出对话框
    function showExportDialog() {
        var layer = layui.layer;
        var form = layui.form;

        if (!objdata.currentGraph || objdata.currentGraph.destroyed) {
            layer.msg('图表未加载，无法导出');
            return;
        }

        const dialogContent = `
            <div style="padding: 20px;">
                <form class="layui-form" lay-filter="exportForm">
                    <div class="layui-form-item">
                        <label class="layui-form-label">导出格式</label>
                        <div class="layui-input-block">
                            <select name="format" lay-verify="required">
                                <option value="">请选择导出格式</option>
                                <option value="png" selected>PNG 图片</option>
                                <option value="jpg">JPEG 图片</option>                       
                            </select>
                        </div>
                    </div>
                    <div class="layui-form-item">
                        <label class="layui-form-label">文件名称</label>
                        <div class="layui-input-block">
                            <input type="text" name="filename" value="节点流程图_${getCurrentTimeString()}" 
                                   placeholder="请输入文件名" class="layui-input" lay-verify="required">
                        </div>
                    </div>
                    <div class="layui-form-item">
                        <label class="layui-form-label">背景颜色</label>
                        <div class="layui-input-block">
                            <select name="backgroundColor">
                                <option value="transparent">透明背景</option>
                                <option value="#ffffff" selected>白色背景</option>
                                <option value="#FAF9DE">护眼背景</option>
                                <option value="#000000">黑色背景</option>
                            </select>
                        </div>
                    </div>
                    <div class="layui-form-item">
                        <label class="layui-form-label">图片质量</label>
                        <div class="layui-input-block">
                            <select name="quality">
                                <option value="1">标准质量</option>
                                <option value="2" selected>高质量</option>
                                <option value="3">超高质量</option>
                            </select>
                        </div>
                    </div>
                </form>
            </div>
        `;

        const exportIndex = layer.open({
            type: 1,
            title: '导出流程图',
            area: ['420px', '500px'],
            content: dialogContent,
            btn: ['导出', '取消'],
            success: function(layero, index) {
                // 重新渲染form
                form.render('select', 'exportForm');
            },
            yes: function(index, layero) {
                // 获取表单数据
                const formData = form.val('exportForm');

                if (!formData.format) {
                    layer.msg('请选择导出格式');
                    return;
                }

                if (!formData.filename.trim()) {
                    layer.msg('请输入文件名');
                    return;
                }

                // 执行导出
                layer.close(index);
                exportGraph(formData);
            }
        });
    }

    // 导出图表
    function exportGraph(options) {
        var layer = layui.layer;

        if (!objdata.currentGraph || objdata.currentGraph.destroyed) {
            layer.msg('图表未加载，无法导出');
            return;
        }

        const { format, filename, backgroundColor = '#ffffff', quality = '2' } = options;

        // 显示导出进度
        const loadingIndex = layer.load(1, {
            shade: [0.3, '#000']
        });

        try {
            let exportPromise;
            switch (format) {
                case 'png':
                    exportPromise = exportToPNG(backgroundColor, filename, quality);
                    break;
                case 'jpg':
                    exportPromise = exportToJPG(backgroundColor, filename, quality);
                    break;
                default:
                    throw new Error('不支持的导出格式');
            }

            exportPromise.then(() => {
                layer.close(loadingIndex);
                layer.msg('导出成功！', { icon: 1 });
            }).catch((error) => {
                layer.close(loadingIndex);
                layer.msg('导出失败: ' + error.message, { icon: 2 });
                console.error('导出失败:', error);
            });

        } catch (error) {
            layer.close(loadingIndex);
            layer.msg('导出失败: ' + error.message, { icon: 2 });
            console.error('导出失败:', error);
        }
    }

    // 导出为PNG
    function exportToPNG(backgroundColor, filename, quality) {
        return new Promise((resolve, reject) => {
            try {
                objdata.currentGraph.downloadFullImage(filename, 'image/png', {
                    backgroundColor: backgroundColor === 'transparent' ? 'transparent' : backgroundColor,
                    padding: [20, 20, 20, 20],
                    ratio: parseFloat(quality)
                });
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    // 导出为JPG
    function exportToJPG(backgroundColor, filename, quality) {
        return new Promise((resolve, reject) => {
            try {
                // JPG不支持透明背景，强制使用白色背景
                const bgColor = backgroundColor === 'transparent' ? '#ffffff' : backgroundColor;
                objdata.currentGraph.downloadFullImage(filename, 'image/jpeg', {
                    backgroundColor: bgColor,
                    padding: [20, 20, 20, 20],
                    ratio: parseFloat(quality)
                });
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    // 获取当前时间字符串
    function getCurrentTimeString() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        return `${year}${month}${day}_${hours}${minutes}${seconds}`;
    }

    // 全局错误处理
    window.onerror = function(msg, url, lineNo, columnNo, error) {
        console.error('页面错误:', {
            message: msg,
            source: url,
            line: lineNo,
            column: columnNo,
            error: error
        });

        if (layui && layui.layer) {
            layui.layer.msg('页面发生错误，请刷新重试', { icon: 2 });
        }

        return false;
    };

    // 页面可见性变化处理
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            // 页面隐藏时暂停动画等
            if (objdata.currentGraph && !objdata.currentGraph.destroyed) {
                // 可以在这里添加暂停相关操作
            }
        } else {
            // 页面显示时恢复
            if (objdata.currentGraph && !objdata.currentGraph.destroyed) {
                // 重新适应画布大小
                setTimeout(() => {
                    const container = document.getElementById('nodeGraphContainer');
                    if (container) {
                        objdata.currentGraph.changeSize(container.clientWidth, container.clientHeight);
                    }
                }, 100);
            }
        }
    });
});
```

### plugin_add_edit.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>创建数据插件</title>
    <meta name="renderer" content="webkit">
    <meta http-equiv="X-UA-Compatible" content="IE=edge,chrome=1">
    <meta name="viewport"
          content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=0">
    <link type="text/css" rel="stylesheet" href="../../css/reset.css"/>
    <link rel="stylesheet" href="../../layui-btkj/css/layui.css" media="all">
    <link rel="stylesheet" href="../../css/layui_ext.css" media="all">
    <link rel="stylesheet" href="../../css/commonstyle-layui-btkj.css">
</head>
<body>
<div class="container">
    <form id="pluginForm" class="form-container">
        <div class="form-section">
            <div class="section-header">
                <i class="fas fa-info-circle"></i>
                | 基本信息
            </div>
            <div class="section-content">
                <div class="basic-info-layout">
                    <!-- 左侧Logo上传 -->
                    <div class="logo-section">
                        <label class="form-label">
                            <span class="required">*</span>数据插件Logo
                        </label>
                        <div class="upload-area-compact">
                            <input type="file" id="logoFile" accept=".png,.jpg,.jpeg" style="display: none;">
                            <i class="fas fa-cloud-upload-alt upload-icon-compact"></i>
                            <i class="layui-icon layui-icon-upload-drag" style="font-size: 30px; color: #1E9FFF"></i>
                            <div class="upload-hint-compact">PNG/JPG<1MB</div>
                        </div>
                        <div id="uploadPreview" style="display: none;">
                            <img id="previewImage" alt="Logo预览">
                        </div>
                        <div id="logo" style="display: none">
                            <img id="imageLogo" alt="Logo">
                        </div>
                    </div>

                    <!-- 右侧表单内容 -->
                    <div class="form-section-right">
                        <!-- 数据插件名称 -->
                        <div class="form-item">
                            <label class="form-label">
                                <span class="required">*</span>数据插件名称
                            </label>
                            <input type="text" name="plugin_name" class="form-input" placeholder="请输入插件名称" maxlength="30" required>
                            <div class="char-counter">
                                <span id="nameCounter">0</span>/30
                            </div>
                        </div>

                        <!-- 类型选择 -->
                        <div class="form-item">
                            <label class="form-label">
                                <span class="required">*</span>类型
                            </label>
                            <div class="radio-group-dots">
                                <div class="radio-item-dot">
                                    <input type="radio" id="type1" name="plugin_type" value="superlink" lay-filter="pluginType" checked>
                                    <label for="type1" class="radio-label-dot">
                                        <span class="radio-dot"></span>
                                        <i class="fas fa-link radio-icon-dot"></i>
                                        超链接
                                    </label>
                                </div>
                                <div class="radio-item-dot">
                                    <input type="radio" id="type2" name="plugin_type" value="http" lay-filter="pluginType">
                                    <label for="type2" class="radio-label-dot">
                                        <span class="radio-dot"></span>
                                        <i class="fas fa-globe radio-icon-dot"></i>
                                        HTTP请求
                                    </label>
                                </div>
                                <div class="radio-item-dot">
                                    <input type="radio" id="type3" name="plugin_type" value="code" lay-filter="pluginType">
                                    <label for="type3" class="radio-label-dot">
                                        <span class="radio-dot"></span>
                                        <i class="fas fa-code radio-icon-dot"></i>
                                        代码块
                                    </label>
                                </div>
                                <div class="radio-item-dot">
                                    <input type="radio" id="type4" name="plugin_type" value="function" lay-filter="pluginType">
                                    <label for="type4" class="radio-label-dot">
                                        <span class="radio-dot"></span>
                                        <i class="fas fa-function radio-icon-dot"></i>
                                        函数
                                    </label>
                                </div>
                            </div>
                        </div>

                        <!-- 内容 -->
                        <div class="form-item">
                            <label class="form-label">
                                <span class="required">*</span>内容
                            </label>
                            <textarea name="content" class="form-textarea" placeholder="请输入内容..." required></textarea>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 扩展信息部分 -->
        <div class="form-section">
            <div class="section-header">
                <i class="fas fa-cogs"></i>
                | 扩展信息
            </div>
            <div class="section-content">
                <!-- 输入信息 -->
                <div class="field-group">
                    <div class="field-group-header">
                        <i class="fas fa-sign-in-alt"></i>
                        | 输入信息（需要用户输入）
                    </div>
                    <div class="field-group-content">
                        <div class="field-row">
                            <div class="field-col">
                                <label>字段名称</label>
                                <input type="text" id="inputFieldName" placeholder="请输入" class="form-input">
                            </div>
                            <div class="field-col">
                                <label>字段类型</label>
                                <select id="inputFieldType" class="select">
                                    <option value="">请选择</option>
                                    <option value="text">文本</option>
                                    <option value="number">数字</option>
                                    <option value="date">日期</option>
                                    <option value="email">邮箱</option>
                                    <option value="url">链接</option>
                                    <option value="boolean">布尔值</option>
                                </select>
                            </div>
                            <div class="field-col">
                                <label>描述</label>
                                <input type="text" id="inputFieldDescription" placeholder="请输入" class="form-input">
                            </div>
                            <div class="field-actions">
                                <button type="button" class="btn btn-primary" id="addInputFieldBtn">
                                    <i class="fas fa-plus"></i>
                                    添加字段
                                </button>
                                <button type="button" class="btn btn-secondary" id="clearInputFieldsBtn">
                                    <i class="fas fa-broom"></i>
                                    清空
                                </button>
                            </div>
                        </div>

                        <div>
                            <strong><i class="fas fa-tags"></i> | 已添加字段</strong>
                        </div>
                        <div class="field-tags-container" id="inputFieldsList">
                            <div class="field-tags-empty">暂无扩展字段，请添加字段或直接从字段库选择</div>
                            <div class="field-tags-list"></div>
                        </div>
                    </div>
                </div>

                <!-- 输出信息 -->
                <div class="field-group">
                    <div class="field-group-header">
                        <i class="fas fa-sign-out-alt"></i>
                        | 输出信息
                    </div>
                    <div class="field-group-content">
                        <div class="field-row">
                            <div class="field-col">
                                <label>字段名称</label>
                                <input type="text" id="outputFieldName" placeholder="请输入" class="form-input">
                            </div>
                            <div class="field-col">
                                <label>字段类型</label>
                                <select id="outputFieldType" class="select">
                                    <option value="">请选择</option>
                                    <option value="text">文本</option>
                                    <option value="number">数字</option>
                                    <option value="date">日期</option>
                                    <option value="email">邮箱</option>
                                    <option value="url">链接</option>
                                    <option value="boolean">布尔值</option>
                                    <option value="array">数组</option>
                                    <option value="object">对象</option>
                                </select>
                            </div>
                            <div class="field-col">
                                <label>描述</label>
                                <input type="text" id="outputFieldDescription" placeholder="请输入" class="form-input">
                            </div>
                            <div class="field-actions">
                                <button type="button" class="btn btn-primary" id="addOutputFieldBtn">
                                    <i class="fas fa-plus"></i>
                                    添加字段
                                </button>
                                <button type="button" class="btn btn-secondary" id="clearOutputFieldsBtn">
                                    <i class="fas fa-broom"></i>
                                    清空
                                </button>
                            </div>
                        </div>

                        <div>
                            <strong><i class="fas fa-tags"></i> | 已添加字段</strong>
                        </div>
                        <div class="field-tags-container" id="outputFieldsList">
                            <div class="field-tags-empty">暂无扩展字段，请添加字段或直接从字段库选择</div>
                            <div class="field-tags-list"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 隐藏的layui提交按钮 -->
        <div style="display: none;">
            <div class="layui-input-block">
                <a id="saveOK" class="layui-btn" lay-submit="lay-submit">提交</a>
            </div>
        </div>
    </form>
</div>

<script data-main="../../js/plugin/plugin_add_edit.js" src='../../sys/require.min.js'></script>


</body>
<style>
    * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;  /* 怪异盒子 */
    }

    body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
        min-height: 100vh;
        background: #f5f7fa;
    }

    .container {
        max-width: 900px;
        margin: 20px auto;
        background: white;
        border-radius: 16px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
        overflow: hidden;
    }

    .form-container {
        padding: 4px;
    }

    .form-section {
        border-radius: 12px;
        overflow: hidden;
        transition: all 0.3s ease;
    }

    .form-section:hover {
        border-color: #27f1bc;
        box-shadow: 0 4px 12px rgb(5, 93, 69);
    }

    .section-header {
        padding: 10px 20px 0 20px;
        font-weight: 600;
        color: #334155;
        font-size: 18px;
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .section-content {
        padding: 20px 25px 0 25px;
    }

    /* 基本信息布局 - 左右分割 */
    .basic-info-layout {
        display: flex;
        gap: 30px;
        align-items: flex-start;
    }

    .logo-section {
        flex: 0 0 160px;
    }

    .form-section-right {
        flex: 1;
    }

    /* 紧凑型上传区域 */
    .upload-area-compact {
        border: 2px dashed #d1d5db;
        border-radius: 12px;
        padding: 20px 15px;
        text-align: center;
        background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
        cursor: pointer;
        transition: all 0.3s ease;
        position: relative;
        overflow: hidden;
        min-height: 120px;
        display: flex;
        flex-direction: column;
        justify-content: center;
    }

    .upload-area-compact:hover {
        border-color: #27f1bc;
        background: linear-gradient(135deg, #f0f4ff 0%, #e0e7ff 100%);
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(102, 126, 234, 0.15);
    }

    .upload-icon-compact {
        font-size: 32px;
        color: #48efc3;
        margin-bottom: 8px;
        display: block;
    }

    .upload-text-compact {
        color: #4b5563;
        font-size: 14px;
        font-weight: 500;
        margin-bottom: 4px;
    }

    .upload-hint-compact {
        color: #6b7280;
        font-size: 12px;
    }

    .form-item {
        margin-bottom: 25px;
    }

    .form-label {
        display: block;
        font-weight: 600;
        color: #374151;
        margin-bottom: 8px;
        font-size: 14px;
    }

    .required {
        color: #ef4444;
        margin-right: 4px;
    }

    .form-input {
        width: 60%;
        padding: 6px 10px;
        border: 2px solid #e5e7eb;
        border-radius: 8px;
        font-size: 14px;
        transition: all 0.3s ease;
        background: #fefefe;
    }

    .form-input:focus {
        outline: none;
        border-color: #27f1bc;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        background: white;
    }

    .form-textarea {
        width: 100%;
        padding: 12px 16px;
        border: 2px solid #e5e7eb;
        border-radius: 8px;
        font-size: 14px;
        transition: all 0.3s ease;
        background: #fefefe;
        resize: vertical;
        min-height: 120px;
        font-family: inherit;
    }

    .form-textarea:focus {
        outline: none;
        border-color: #48efc3;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        background: white;
    }

    .char-counter {
        text-align: right;
        color: #6b7280;
        font-size: 12px;
        margin-top: 4px;
    }

    .char-counter.warning {
        color: #ef4444;
        font-weight: 600;
    }

    /* 圆点单选按钮样式 */
    .radio-group-dots {
        display: flex;
        flex-wrap: wrap;
        gap: 15px;
    }

    .radio-item-dot {
        position: relative;
    }

    .radio-item-dot input[type="radio"] {
        position: absolute;
        opacity: 0;
        cursor: pointer;
        width: 0;
        height: 0;
    }

    .radio-label-dot {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 0;
        cursor: pointer;
        transition: all 0.3s ease;
        font-weight: 500;
        color: #374151;
        position: relative;
    }

    .radio-dot {
        width: 16px;
        height: 16px;
        border: 2px solid #d1d5db;
        border-radius: 50%;
        display: inline-block;
        transition: all 0.3s ease;
        position: relative;
        background: white;
    }

    .radio-dot::after {
        content: '';
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #27f1bc;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0);
        transition: transform 0.2s ease;
    }

    .radio-item-dot input[type="radio"]:checked + .radio-label-dot .radio-dot {
        border-color: #48efc3;
    }

    .radio-item-dot input[type="radio"]:checked + .radio-label-dot .radio-dot::after {
        transform: translate(-50%, -50%) scale(1);
    }

    .radio-item-dot:hover .radio-label-dot {
        color: #27f1bc;
    }

    .radio-item-dot:hover .radio-dot {
        border-color: #48efc3;
    }

    .radio-icon-dot {
        font-size: 16px;
        color: #6b7280;
        transition: color 0.3s ease;
    }

    .radio-item-dot input[type="radio"]:checked + .radio-label-dot .radio-icon-dot {
        color: #27f1bc;
    }

    /* 字段组美化 */
    .field-group {
        border: 1px solid #e8e8e8;
        border-radius: 12px;
        margin-bottom: 25px;
        transition: all 0.3s ease;
    }

    .field-group:hover {
        border-color: #48efc3;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.1);
    }

    .field-group-header {
        padding: 10px 0 10px 20px;
        border-bottom: 1px solid #e8e8e8;
        font-weight: 600;
        font-size: 14px;
        color: #475569;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .field-group-content {
        padding: 10px 0 0 70px;
    }

    .field-row {
        display: flex;
        margin-bottom: 10px;
        align-items: flex-start;
    }

    .field-col{
        display: flex;
        flex: 1;
        align-items: center;

        label{
            color: #6b7280;
            margin-right: 4px;
        }

    }



    .field-actions {
        flex: 0 0 auto;
        display: flex;
        gap: 8px;
    }

    .btn {
        padding: 10px 16px;
        margin-right: 10px;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.3s ease;
        display: inline-flex;
        align-items: center;
        gap: 6px;
    }

    .btn-primary {
        background: linear-gradient(135deg, #48efc3 0%, #267e77 100%);
        color: white;
    }

    .btn-primary:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
    }

    .btn-secondary {
        background: #f3f4f6;
        color: #6b7280;
        border: 1px solid #d1d5db;
    }

    .btn-secondary:hover {
        background: #e5e7eb;
        color: #374151;
    }

    .select {
        width: 50%;
        padding: 6px 10px;
        border: 2px solid #e5e7eb;
        border-radius: 8px;
        font-size: 14px;
        transition: all 0.3s ease;
        background: #fefefe;
        cursor: pointer;
    }

    .select:focus {
        outline: none;
        border-color: #48efc3;
        box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .added-fields-list {
        background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 20px;
        margin-top: 20px;
        min-height: 80px;
    }

    .added-fields-empty {
        text-align: center;
        color: #9ca3af;
        font-style: italic;
        padding: 30px;
    }

    .field-item {
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 15px;
        margin-bottom: 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        transition: all 0.3s ease;
    }

    .field-item:hover {
        border-color: #27f1bc;
        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.1);
    }

    .field-info {
        flex: 1;
        display: flex;
        gap: 15px;
        align-items: center;
    }

    .field-name {
        font-weight: 600;
        color: #374151;
    }

    .field-type {
        background: linear-gradient(135deg, #27f1bc 0%, #055d45 100%);
        color: white;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 500;
    }

    .field-remove {
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #dc2626;
        padding: 6px 8px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.3s ease;
        font-size: 14px;
    }

    .field-remove:hover {
        background: #fee2e2;
        border-color: #fca5a5;
    }

    .form-footer {
        padding: 30px 40px;
        border-top: 1px solid #e5e7eb;
        background: #f8fafc;
        display: flex;
        justify-content: center;
        gap: 15px;
    }

    .btn-large {
        padding: 15px 30px;
        font-size: 16px;
        font-weight: 600;
    }

    .fade-in {
        animation: fadeIn 0.5s ease forwards;
    }

    /* 新的标签样式字段列表 */
    .field-tags-container {
        margin-top: 20px;
        min-height: 80px;
    }

    .field-tags-list {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 10px;
    }

    .field-tag {
        display: inline-flex;
        align-items: center;
        background: linear-gradient(135deg, #48efc3 0%, #267e77 100%);
        color: white;
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 13px;
        font-weight: 500;
        box-shadow: 0 2px 8px rgba(102, 126, 234, 0.2);
        transition: all 0.3s ease;
        animation: slideIn 0.3s ease;
    }

    .field-tag:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
    }

    .field-tag-name {
        margin-right: 8px;
    }

    .field-tag-type {
        background: rgba(255, 255, 255, 0.2);
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 11px;
        margin-right: 8px;
    }

    .field-tag-remove {
        background: rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s ease;
        font-size: 12px;
        margin-left: 4px;
    }

    .field-tag-remove:hover {
        background: rgba(255, 255, 255, 0.3);
        transform: scale(1.1);
    }

    .field-tags-empty {
        text-align: center;
        color: #9ca3af;
        font-style: italic;
        padding: 20px;
    }

    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateX(-10px) scale(0.8);
        }
        to {
            opacity: 1;
            transform: translateX(0) scale(1);
        }
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    /* 响应式设计 */
    @media (max-width: 768px) {
        .basic-info-layout {
            flex-direction: column;
            gap: 20px;
        }

        .logo-section {
            flex: none;
            align-self: center;
        }

        .radio-group-dots {
            flex-direction: column;
            gap: 10px;
        }

        .field-row {
            flex-direction: column;
            gap: 15px;
        }

        .field-actions {
            flex-direction: column;
        }

        .field-tags-list {
            gap: 6px;
        }
    }

    /* 预览图片样式 */
    #uploadPreview {
        margin-top: 15px;
        text-align: center;
    }

    #previewImage {
        max-width: 120px;
        max-height: 80px;
        border-radius: 8px;
        border: 2px solid #e5e7eb;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
</style>
</html>
```

### plugin_add_edit.js

```js
/**
 * 插件表单处理 - 改进版本
 * 作者：龚喜
 * 时间：2025-08-18
 */

require.config({
    paths: {
        jquery: '../../sys/jquery',
        system: '../../sys/system',
        layui: "../../layui-btkj/layui",
        layuicommon: "../../sys/layuicommon",
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
        }
    },
    waitSeconds: 0
});

// 全局变量
let objdata = {
    pluginType: [
        {
            id: "1",
            name: "superlink",
            title: "超链接",
            icon: "fas fa-link"
        },
        {
            id: "2",
            name: "http",
            title: "HTTP请求",
            icon: "fas fa-globe"
        },
        {
            id: "3",
            name: "code",
            title: "代码块",
            icon: "fas fa-code"
        },
        {
            id: "4",
            name: "function",
            title: "函数",
            icon: "fas fa-function"
        }
    ],
    selectType: "superlink", // 默认选择超链接类型
    imageUrl: "",  // 存储上传成功后的图片地址
    inputFields: [],
    outputFields: []
};

require(["jquery", "system", 'layui', 'layuicommon'], function () {
    layui.use(['form', 'layer', 'upload'], function () {
        let form = layui.form;
        let layer = layui.layer;
        let upload = layui.upload;

        // 初始化表单
        initForm();

        // 初始化上传
        initUpload();

        // 绑定事件
        bindEvents();

        // 如果是编辑模式，加载数据
        if (Arg("type") === "update" && Arg("id") !== "") {
            $.sm((re, err) => {
                if (err) {
                    layer.msg(err, {icon: 2});
                } else {
                    let data = re[0];
                    populateForm(data);
                }
            }, ["w_plugin.selectById", $.msgwhere({id: [Arg("id")]})]);
        }

        /**
         * 初始化表单
         */
        function initForm() {
            var form = layui.form;
            form.render();

            // 监听单选框变化
            form.on('radio(pluginType)', function(data) {
                objdata.selectType = data.value;
                updateContentPlaceholder(data.value);
            });

            // 字符计数器
            $('input[name="plugin_name"]').on('input', function() {
                updateCharCounter($(this), 30, '#nameCounter');
            });
        }

        /**
         * 初始化上传组件
         */
        function initUpload() {
            upload.render({
                elem: '.upload-area-compact',
                url: getUploadUrl(), // 修复：使用动态获取的上传地址
                accept: 'images',
                acceptMime: 'image/png,image/jpg,image/jpeg',
                size: 1024,
                before: function(obj) {
                    layer.load();
                },
                done: function(res) {
                    layer.closeAll('loading');
                    // 修复：兼容不同的响应格式
                    if ((res.code === 0 || res.status === 'success') && res.data) {
                        // 将url给到全局的变量imageUrl  给到表单提交
                        objdata.imageUrl = res.data.url || res.data.path || res.data;
                        showPreview(objdata.imageUrl);
                        layer.msg('Logo上传成功', {icon: 1});
                    } else {
                        const errorMsg = res.msg || res.message || '上传失败';
                        layer.msg('上传失败：' + errorMsg, {icon: 2});
                    }
                },
                error: function() {
                    layer.closeAll('loading');
                    layer.msg('上传失败，请重试', {icon: 2});
                }
            });

            // 初始化拖拽上传
            initDragUpload();
        }

        /**
         * 获取上传URL
         */
        function getUploadUrl() {
            // 可以根据实际环境动态获取上传地址
            if (typeof window.uploadConfig !== 'undefined' && window.uploadConfig.url) {
                return window.uploadConfig.url;
            }
            // 默认上传地址，可以配置到配置文件中
            return '/api/upload';
        }

        /**
         * 绑定事件
         */
        function bindEvents() {
            // 保存按钮
            $("#saveOK").click(function(event) {
                event.preventDefault();
                // TODO 回调之后没有关闭模态框和重新加载表格
                submitForm().then(r => {

                });
            });

            // 取消按钮
            $("#cancelBtn").click(function() {
                if (confirm('确定要取消吗？未保存的数据将丢失。')) {
                    parent.layer.closeAll();
                }
            });

            // 添加字段按钮
            $("#addInputFieldBtn").click(function() {
                addInputField();
            });

            $("#addOutputFieldBtn").click(function() {
                addOutputField();
            });

            // 清空字段按钮
            $("#clearInputFieldsBtn").click(function() {
                clearFields('input');
            });

            $("#clearOutputFieldsBtn").click(function() {
                clearFields('output');
            });

            // 回车键添加字段
            $('#inputFieldName').keypress(function(e) {
                if (e.which === 13) {
                    e.preventDefault();
                    addInputField();
                }
            });

            $('#outputFieldName').keypress(function(e) {
                if (e.which === 13) {
                    e.preventDefault();
                    addOutputField();
                }
            });

            // 快捷键支持
            $(document).keydown(function(e) {
                if (e.ctrlKey && e.keyCode === 13) {
                    submitForm();
                }
            });
        }

        /**
         * 提交表单 - 修复表单验证和数据获取问题
         */
        function submitForm() {
            return new Promise((resolve, reject) => {
                let formData = getFormData();

                const validation = validateFormData(formData);
                if (!validation.isValid) {
                    layui.layer.msg(validation.message, {icon: 2});
                    reject(new Error(validation.message));
                    return;
                }

                formData.logo = objdata.imageUrl;

                var input_fields = encodeURIComponent(JSON.stringify(objdata.inputFields));
                var output_fields = encodeURIComponent(JSON.stringify(objdata.outputFields));

                formData = $.extend(formData,{'input':input_fields,'output':output_fields});

                let type = Arg("type");
                if (type === "add") {
                    addPlugin(formData, resolve, reject);
                } else if (type === "update") {
                    formData.id = Arg("id");
                    updatePlugin(formData, resolve, reject);
                }
            });
        }

        /**
         * 获取表单数据
         */
        function getFormData() {
            return {
                plugin_name: $('input[name="plugin_name"]').val().trim(),
                plugin_type: $('input[name="plugin_type"]:checked').val(),
                content: $('textarea[name="content"]').val().trim()
            };
        }

        /**
         * 验证表单数据 TODO 不能
         */
        function validateFormData(data) {
            if (!data.plugin_name) {
                return { isValid: false, message: '请输入插件名称' };
            }
            if (data.plugin_name.length > 30) {
                return { isValid: false, message: '插件名称不能超过30个字符' };
            }
            if (!data.plugin_type) {
                return { isValid: false, message: '请选择插件类型' };
            }
            if (!data.content) {
                return { isValid: false, message: '请输入内容' };
            }
            if (data.plugin_type === 'http' && !isValidUrl(data.content)) {
                return { isValid: false, message: '请输入有效的HTTP请求路径' };
            }

            return { isValid: true };
        }

        //  TODO 同时保留供外部调用的函数 没有正确使用导致了manager.js中的函数使用时报错，其次不想使用new promise  因为会在控制台直接打印错误
        window.submitForm = function() {
            submitForm().then(r => {}
            );
        }

        /**
         * 添加插件
         */
        function addPlugin(data, resolve, reject) {
            $.sm((re, err) => {
                if (err) {
                    layui.layer.msg(err, {icon: 2});
                    reject(new Error(err));
                } else {
                    layui.layer.msg("插件添加成功！", {icon: 1});
                    resolve(re);
                }
            }, ["w_plugin.add", JSON.stringify(data)]);
        }


        /**
         * 更新插件
         */
        function updatePlugin(data, resolve, reject) {
            $.sm((re, err) => {
                if (err) {
                    layui.layer.msg(err, {icon: 2});
                    reject(new Error(err));
                } else {
                    layui.layer.msg("插件更新成功！", {icon: 1});
                    resolve(re);
                }
            }, ["w_plugin.update", JSON.stringify(data), $.msgwhere({id: [data.id]})]);
        }


        /**
         * 填充表单数据
         */
        function populateForm(data) {
            // 填充基本信息
            $('input[name="plugin_name"]').val(data.plugin_name || '');
            $('textarea[name="content"]').val(data.content || '');

            // 设置单选框
            if (data.plugin_type) {
                $(`input[name="plugin_type"][value="${data.plugin_type}"]`).prop('checked', true);
                objdata.selectType = data.plugin_type;
            }

            // 解析并设置字段数据
            if (data.input) {
                try {
                    const inputFields = typeof data.input === 'string'
                        ? JSON.parse(data.input)
                        : data.input;
                    objdata.inputFields = Array.isArray(inputFields) ? inputFields : [];
                    renderFieldTags('input');
                } catch (e) {
                    console.warn('输入字段数据解析失败:', e);
                    objdata.inputFields = [];
                }
            }

            if (data.output) {
                try {
                    const outputFields = typeof data.output === 'string'
                        ? JSON.parse(data.output)
                        : data.output;
                    objdata.outputFields = Array.isArray(outputFields) ? outputFields : [];
                    renderFieldTags('output');
                } catch (e) {
                    console.warn('输出字段数据解析失败:', e);
                    objdata.outputFields = [];
                }
            }

            // 设置logo
            if (data.logo) {
                objdata.imageUrl = data.logo;
                showPreview(data.logo);
            }

            // 更新字符计数器
            updateCharCounter($('input[name="plugin_name"]'), 30, '#nameCounter');

            // 重新渲染表单
            form.render();
        }

        /**
         * 添加输入字段
         */
        function addInputField() {
            let name = $('#inputFieldName').val().trim();
            let type = $('#inputFieldType').val();
            let description = $('#inputFieldDescription').val().trim();

            if (!name || !type) {
                layer.msg('请填写完整的字段信息', {icon: 2});
                return;
            }

            // 检查是否已存在
            if (objdata.inputFields.some(field => field.name === name)) {
                layer.msg('字段名称已存在', {icon: 2});
                return;
            }

            objdata.inputFields.push({
                name: name,
                type: type,
                required: false,
                description: description
            });

            renderFieldTags('input');
            clearFieldInputs('input');
            layer.msg('输入字段添加成功', {icon: 1});
        }

        /**
         * 添加输出字段
         */
        function addOutputField() {
            let name = $('#outputFieldName').val().trim();
            let type = $('#outputFieldType').val();
            let description = $('#outputFieldDescription').val().trim();

            if (!name || !type) {
                layer.msg('请填写完整的字段信息', {icon: 2});
                return;
            }

            if (objdata.outputFields.some(field => field.name === name)) {
                layer.msg('字段名称已存在', {icon: 2});
                return;
            }

            objdata.outputFields.push({
                name: name,
                type: type,
                description: description
            });

            renderFieldTags('output');
            clearFieldInputs('output');
            layer.msg('输出字段添加成功', {icon: 1});
        }

        /**
         * 渲染字段标签
         */
        function renderFieldTags(fieldType) {
            let fields = fieldType === 'input' ? objdata.inputFields : objdata.outputFields;
            let container = fieldType === 'input' ? '#inputFieldsList' : '#outputFieldsList';
            let tagsList = container + ' .field-tags-list';
            let emptyDiv = container + ' .field-tags-empty';

            if (fields.length === 0) {
                $(emptyDiv).show();
                $(tagsList).empty();
                return;
            }

            $(emptyDiv).hide();

            /*todo 需要将其改为列表形式*/
            let tagsHtml = fields.map((field, index) => `
                <div class="field-tag" data-index="${index}" data-type="${fieldType}">
                    <span class="field-tag-name">${field.name}</span>
                    <span class="field-tag-type">${getTypeLabel(field.type)}</span>
                    <span class="field-tag-despriction">${field.description}</span>
                    <button type="button" class="field-tag-remove" onclick="removeFieldTag('${fieldType}', ${index})">
                        ×
                    </button>
                </div>
            `).join('');

            $(tagsList).html(tagsHtml);
        }

        /**
         * 移除字段标签
         */
        window.removeFieldTag = function(fieldType, index) {
            if (fieldType === 'input') {
                objdata.inputFields.splice(index, 1);
            } else {
                objdata.outputFields.splice(index, 1);
            }
            renderFieldTags(fieldType);
            layer.msg('字段已移除', {icon: 1});
        };

        /**
         * 清空字段
         */
        function clearFields(fieldType) {
            let fields = fieldType === 'input' ? objdata.inputFields : objdata.outputFields;
            if (fields.length === 0) {
                layer.msg('没有可清空的字段', {icon: 2});
                return;
            }

            layer.confirm('确定要清空所有字段吗？', function(index) {
                if (fieldType === 'input') {
                    objdata.inputFields = [];
                } else {
                    objdata.outputFields = [];
                }
                renderFieldTags(fieldType);
                layer.msg('字段已清空', {icon: 1});
                layer.close(index);
            });
        }

        /**
         * 清空字段输入框
         */
        function clearFieldInputs(fieldType) {
            if (fieldType === 'input') {
                $('#inputFieldName').val('');
                $('#inputFieldType').val('');
            } else {
                $('#outputFieldName').val('');
                $('#outputFieldType').val('');
            }
        }

        /**
         * 工具函数
         */
        function getTypeLabel(type) {
            const typeMap = {
                text: '文本',
                number: '数字',
                date: '日期',
                email: '邮箱',
                url: '链接',
                boolean: '布尔值',
                array: '数组',
                object: '对象'
            };
            return typeMap[type] || type;
        }

        function updateContentPlaceholder(type) {
            let placeholder = '';
            switch (type) {
                case 'superlink':
                    placeholder = '请输入链接地址，如：https://example.com';
                    break;
                case 'http':
                    placeholder = '请输入API接口地址，如：https://api.example.com/data';
                    break;
                case 'code':
                    placeholder = '请输入代码块，支持多种编程语言';
                    break;
                case 'function':
                    placeholder = '请输入函数定义或函数调用代码';
                    break;
                default:
                    placeholder = '请输入内容...';
            }
            $('textarea[name="content"]').attr('placeholder', placeholder);
        }

        function updateCharCounter($input, maxLength, counterSelector) {
            let currentLength = $input.val().length;
            $(counterSelector).text(currentLength);

            if (currentLength > maxLength * 0.8) {
                $(counterSelector).addClass('warning');
            } else {
                $(counterSelector).removeClass('warning');
            }
        }

        function showPreview(imageUrl) {
            $('#previewImage').attr('src', imageUrl);
            $('#uploadPreview').show();
        }

        function isValidUrl(string) {
            try {
                new URL(string);
                return true;
            } catch (_) {
                return false;
            }
        }

        function initDragUpload() {
            const uploadArea = document.querySelector('.upload-area-compact');
            if (!uploadArea) return;

            uploadArea.addEventListener('dragover', function(e) {
                e.preventDefault();
                e.stopPropagation();
                uploadArea.style.borderColor = '#667eea';
                uploadArea.style.background = 'linear-gradient(135deg, #f0f4ff 0%, #e0e7ff 100%)';
            });

            uploadArea.addEventListener('dragleave', function(e) {
                e.preventDefault();
                e.stopPropagation();
                uploadArea.style.borderColor = '#d1d5db';
                uploadArea.style.background = 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)';
            });

            uploadArea.addEventListener('drop', function(e) {
                e.preventDefault();
                e.stopPropagation();
                uploadArea.style.borderColor = '#d1d5db';
                uploadArea.style.background = 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)';

                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    const file = files[0];
                    if (file.type.startsWith('image/')) {
                        // 修复：正确触发上传
                        const fileInput = document.getElementById('logoFile');
                        fileInput.files = files;
                        fileInput.dispatchEvent(new Event('change'));
                    } else {
                        layer.msg('请上传图片文件', {icon: 2});
                    }
                }
            });
        }
    });
});
```



### agent_manage.js

存在的问题，节点复制时，关系紊乱

```js
require.config({
    paths: {
        jquery: '../../sys/jquery',
        system: '../../sys/system',
        layui: "../../layui-btkj/layui",
        config: "../../js/layui_config"
    },
    shim: {
        "system": {
            deps: ["jquery"]
        },
        "layui": {
            deps: ["jquery", "system"]
        },
        "config": {
            deps: ["layui"]
        }
    },
    waitSeconds: 0
});

objdata = {
    agent_id:'',
    pluginList: []
};

require(["jquery", "system", "layui"], function () {
    layui.use(['table', 'form','layer'], function () {
        let table = layui.table;
        let form = layui.form;
        let layer = jQuery.getparent().layer;

        // 初始化
        initAgentTable();

        // 搜索
        $("#searchAgent").click(function () {
            const search = $("#agentName").val(); // 拿到输入框的值
            var status = $("#search_status").val();

            objdata.objwhere = {}
            if(search){
                objdata.objwhere.agentName = [search];
            }
            if(status){
                objdata.objwhere.status = [status];
            }
            // 重新加载table
            table.reload('agentTable', {
                where: {
                    swhere: $.msgwhere(objdata.objwhere), // 后端的laywhere接收 数据格式为json
                    fields: 'ag.id',
                    types:'asc'
                },
                page: {
                    curr: 1
                }
            })
        })
        // 重置
        $("#resetSearch").click(function () {
            // 清空搜索条件 和状态
            $("#pluginName").val("");
            $("#search_status").val("");
            objdata.objwhere = {};
            table.reload('pluginTable', {
                where: {
                    swhere: $.msgwhere(objdata.objwhere),
                    fields: 'id',
                    types: 'asc'
                },
                page: {
                    curr: 1
                }
            })
        })

        // 智能体添加
        $("#addAgent").click((e) => {

            layer.open({
                type: 2,
                title: "添加",
                shadeClose: false,
                area: ['620px', '700px'],
                content: 'html/agent/agent_add_edit.html?v=' + Arg("v") + '&type=' + "add" + '&mid=' + Arg("mid"),
                success: function (layero, index) {
                },
                btn: ["保存", "取消"],
                yes: function (index, layero) {     //或者使用btn1
                    let w = layero.find('iframe')[0].contentWindow;
                    w.$("#saveOK").trigger("click", function () {  //提交按钮

                        setTimeout(function (){
                            table.reload('agentTable');
                        }, 500)

                        layer.close(index);        //"btnok" 被点击后，关闭当前的模态窗口。
                    });
                },
                no: function (index, layero) {
                    table.reload('agentTable');
                    layer.close(index);        //"editOK" 被点击后，关闭当前的模态窗口。
                }
            });
        });

        // 批量删除
        $("#delAgentsBtn").click(() => {
            let layer = jQuery.getparent().layer;
            let delList = [];
            let checkStatus = table.checkStatus('agentTable');
            checkStatus.data.forEach(function (item) {
                delList.push(item.id);
            });
            if(delList.length === 0){
                layer.msg("请选择要删除的项");
                return;
            }
            layer.confirm('请确认是否删除选中数据?', function (index) {
                layer.close(index);
                $.sm((re, err) => {
                    if (err) {
                        layer.msg(err);
                    } else {
                        layer.msg("删除成功！");
                        table.reload('agentTable');
                    }
                }, ["w_agent.update", JSON.stringify({
                    isdel: "1"
                }), $.msgwhere({ids: $.msgpJoin(delList)})])
            });
        })

        // 导入解析
        $("#importAgent").click(() => {
            layer.open({
                type: 2,
                title: "导入解析",
                shadeClose: false,
                area: ['1200px', '900px'],
                content: 'html/agent/agent_node_import.html?v=' + Arg("v") + '&type=' + "agent" + '&mid=' + Arg("mid"),
                success: function (layero, index) {
                },
                // 出错提示
                error: function (index, err) {
                    layer.msg(err);
                },
                btn: ["保存", "取消"],
                yes: function (index, layero) {

                }
            })
        })



    });
    function initAgentTable() {
        let table = layui.table;
        let layer = jQuery.getparent().layer;
        let form = layui.form;

        $.sm(function (re, err){
            if(err){
                layer.msg(err);
            }else{
                objdata.pluginList = re;
            }
        }, ["w_plugin.getIdAndName"])

        table.render({
            elem: '#agentTable',
            url: $.layurl + '?' + $.getSmStr(['w_agent.getList']),
            height: 'full-' + ($("#laytable").offset().top + 30),
            page: true,
            where: {
                fields: 'ag.id',  // 排序字段
                types: 'asc'
            },
            cols: [[
                {type: 'checkbox'},
                {field: 'display_sort', width: 100,align: 'center', title: '显示排序',sort: true},
                {field: 'id', width: 80, title: 'ID',align: 'center', sort: true},
                {field: 'agent_name', width: 100, align: 'center',title: '智能体名称'},
                {field: 'logo', width: 100, title: '智能体封面', align: 'center', templet: function ( d){
                        if (/^\d+$/.test(d.logo)) {
                            const plugin = objdata.pluginList.find(item => item.id == d.logo);
                            return '<span>' + plugin.plugin_name + '(ID: ' + d.logo + ')</span>';
                        } else if (d.logo) {
                            // 否则作为图片显示
                            return '<img src="' + d.logo + '" style="width: 50px; height: 50px; padding: 2px" onerror="this.style.display=\'none\'">';
                        } else {
                            return '<span>无封面</span>';
                        }
                    }},
                {field: 'description', width: 80,align: 'center', title: '描述'},
                {field: 'applicable_end', title: '适用端',align: 'center', width: 200},
                {field: 'applicable_role', title: '适用角色', align: 'center',width: 200},
                {field: 'num', title: '节点数量', width: 160,align: 'center', templet: "#numTpl"},
                {field: 'time_granularity', title: '时间维度', align: 'center',width: 100},
                // {field: 'function_type', title: '所属功能',align: 'center', width: 200},
                // { field: 'creatime', title: '创建时间',align: 'center', width: 200},
                // { field: 'altime', title: '更新时间',align: 'center', width: 200},
                {field: 'status', title: '状态', width: 100,align: 'center', templet: "#statusTpl"},
                {fixed: 'right', title: '操作', align: 'center',width: 230, minWidth: 200, templet:'#agent_handle'}
            ]],
            toolbar: '#toolbar', //工具栏
            defaultToolbar: ['filter', 'print', 'exports'], // 筛选  打印  导出

        });

        form.on('switch(status-enable)', function (obj) {
            console.log(obj);

            $.sm(function (re, err) {
                if (err) {
                    layer.msg(err);
                } else {
                    layer.msg('修改成功');
                }
            }, ["w_agent.enable", obj.value, this.checked ? 0 : 1]);
        });

        // 触发单元格工具事件
        table.on('tool(agentTable)', function (obj) {
            let data = obj.data; // 获得当前行数据
            let agentId = data.id;
            let agentName = data.agent_name;

            switch (obj.event){
                case 'edit':
                    editFunc(agentId,agentName);
                    break;
                case 'del':
                    delFunc(data,agentId);
                    break;
                case 'addNode':
                    addNodeFunc(agentId,agentName);
                    break;
                case 'copyAgent':
                    copyAgentFunc(agentId,agentName);
                    break;
                case 'nodeList':
                    nodeListFunc(agentId,agentName);
                    break;
                case 'nodeNum':
                    jumpGraph(agentId);
                    break;

            }
        });

        function editFunc(agentId,agentName) {
            jQuery.getparent().layer.open({
                type: 2,
                title: "修改"+agentName+"智能体",
                shadeClose: false,
                area: ['620px', '700px'],
                content: 'html/agent/agent_add_edit.html?v=' + Arg("v") + '&type=' + "update" + '&mid=' + Arg("mid") + "&id=" + agentId,
                success: function (layero, index) {
                },
                btn: ["保存", "取消"],
                yes: function (index, layero) {     //或者使用btn1
                    let w = layero.find('iframe')[0].contentWindow;
                    w.$("#saveOK").trigger("click", function () {//提交按钮
                        layer.close(index)
                        table.reload('agentTable');
                    });
                },
                no: function (index, layero) {
                    layer.close(index);        //"editOK" 被点击后，关闭当前的模态窗口。
                    table.reload('agentTable');
                }
            });
        }

        function delFunc(data,agentId){
            layer.confirm('真的删除智能体' + data.agent_name + '吗？', function (index) {
                layer.close(index);
                // 向服务端发送删除指令
                $.sm((re, err) => {
                    if (re) {
                        layer.msg("删除成功！");
                    } else {
                        layer.msg(err);
                    }
                    table.reload('agentTable');
                }, ["w_agent.update", JSON.stringify({
                    isdel: "1"
                }), $.msgwhere({id: [agentId]})]);
            });
        }

        // 为只能体添加节点
        function addNodeFunc(agentId,agentName){
            jQuery.getparent().layer.open({
                type: 2,
                title: "为智能体 --->"+ agentName+ " <--- 添加节点",
                shadeClose: false,
                area: ['620px', '700px'],
                content: 'html/agent/node_add_edit.html?v=' + Arg("v") + '&type=' + "add" + '&mid=' + Arg("mid") + "&id=" + agentId,
                success: function (layero, index) {
                },
                btn: ["保存", "取消"],
                yes: function (index, layero) {     //或者使用btn1
                    let w = layero.find('iframe')[0].contentWindow;
                    w.$("#saveOK").trigger("click", function () {//提交按钮
                        layer.close(index)
                        table.reload('agentTable');
                    });
                },
                no: function (index, layero) {
                    layer.close(index);        //"editOK" 被点击后，关闭当前的模态窗口。
                    table.reload('agentTable');
                }
            });
        }

        /* TODO 复制智能体 需要优化
            存在的问题  与数据库交互次数过多  但是父节点这个又需要先去数据库拿到
            存在优化空间
            但是现在智能体数量和节点在正式线上数据量不是很大  暂且这样
        * */
        function copyAgentFunc(agentId, agentName) {
            // 弹出选择框，让用户选择复制类型
            let content = `
                <div style="padding: 20px;">
                    <p style="margin-bottom: 15px;">请选择复制类型：</p>
                    <div>
                        <label style="display: block; margin-bottom: 10px; cursor: pointer;">
                            <input type="radio" name="copyType" value="agent" checked style="margin-right: 8px;">
                            只复制智能体
                        </label>
                        <label style="display: block; cursor: pointer;">
                            <input type="radio" name="copyType" value="all" style="margin-right: 8px;">
                            复制智能体及其节点
                        </label>
                    </div>
                </div>
            `;

            layer.confirm(content, {
                title: '复制' + agentName + '智能体',
                btn: ['确定', '取消'],
                btn1: function(index, layero) {
                    let selectedType = $(layero).find('input[name="copyType"]:checked').val();
                    layer.close(index);

                    if (selectedType) {
                        copyAgent(agentId, selectedType);
                    } else {
                        layer.msg('请选择复制类型');
                    }
                }
            });
        }

        async function copyAgent(agentId, type) {
            try {
                const loadingMsg = type === 'all' ? '正在复制智能体及其节点...' : '正在复制智能体...';
                layer.msg(loadingMsg);

                // 获取智能体数据
                const agentData = await new Promise((resolve, reject) => {
                    $.sm(function (re, err) {
                        if (err) {
                            reject(new Error('获取智能体数据失败：' + err));
                        } else {
                            resolve(re[0]);
                        }
                    }, ["w_agent.selectById", $.msgwhere({id: [agentId]})]);
                });

                if (!agentData) {
                    layer.msg('智能体数据为空，无法复制');
                    return;
                }

                // 清洗智能体数据，清除原有的id、创建时间和更新时间
                const cleanAgentData = {...agentData};
                delete cleanAgentData.id;
                delete cleanAgentData.creatime;
                delete cleanAgentData.altime;

                if (type === 'agent') {
                    // 只复制智能体
                    await new Promise((resolve, reject) => {
                        $.sm(function (re, err) {
                            if (err) {
                                reject(new Error('插入智能体失败：' + err));
                            } else {
                                resolve(re);
                            }
                        }, ["w_agent.add", JSON.stringify(cleanAgentData)]);
                    });

                    layer.msg('复制智能体成功');
                    table.reload('agentTable');
                } else {
                    // 复制智能体及其节点
                    await copyAgentWithNodes(cleanAgentData, agentId);
                }

            } catch (error) {
                layer.msg('复制失败：' + error.message);
                console.error('复制错误：', error);
            }
        }

        async function copyAgentWithNodes(cleanAgentData, originalAgentId) {
            try {
                // 获取节点数据
                const nodeList = await new Promise((resolve, reject) => {
                    $.sm(function (re, err) {
                        if (err) {
                            reject(new Error('获取节点数据失败：' + err));
                        } else {
                            resolve(re || []);
                        }
                    }, ["w_agent_node.getCopyList", $.msgwhere({agent_id: [originalAgentId]})]);
                });

                if (!nodeList || nodeList.length === 0) {
                    layer.msg('节点数据为空，请先添加节点或者只复制智能体');
                    return;
                }

                // 插入智能体，获取新的智能体ID
                const newAgentId = await new Promise((resolve, reject) => {
                    $.sm(function (re, err) {
                        if (err) {
                            reject(new Error('插入智能体失败：' + err));
                        } else {
                            resolve(re);
                        }
                    }, ["w_agent.add", JSON.stringify(cleanAgentData)]);
                });

                // 清洗节点数据
                const cleanNodeList = nodeList.map(node => {
                    const cleanNode = {...node};
                    delete cleanNode.id;
                    delete cleanNode.creatime;
                    delete cleanNode.altime;
                    return cleanNode;
                });

                // 按层级排序节点：独立节点和根节点优先
                const sortedNodes = [];
                const remaining = [...cleanNodeList];

                // 先找出独立节点和根节点  目的保持原来的节点之间的关系
                let currentLevel = remaining.filter(node =>
                    !node.parent_id ||
                    node.parent_id === 0 ||
                    node.parent_id === '' ||
                    node.parent_id === null ||
                    node.parent_id === undefined
                );

                const oldToNewIdMap = new Map(); // 旧节点ID -> 新节点ID的映射

                while (currentLevel.length > 0) {
                    // 添加当前层级的节点到结果中
                    sortedNodes.push(...currentLevel);

                    // 从剩余节点中移除已处理的节点
                    currentLevel.forEach(node => {
                        const index = remaining.indexOf(node);
                        if (index > -1) remaining.splice(index, 1);
                    });

                    // 如果没有剩余节点，跳出循环
                    if (remaining.length === 0) break;

                    // 找出下一层级的节点
                    const currentLevelOriginalIds = currentLevel.map(node => {
                        // 根据节点内容找到原始节点ID
                        const original = nodeList.find(originalNode => {
                            return Object.keys(node).every(key =>
                                key === 'agent_id' || key === 'parent_id' || originalNode[key] === node[key]
                            );
                        });
                        return original ? original.id : null;
                    }).filter(id => id);

                    currentLevel = remaining.filter(node =>
                        node.parent_id && currentLevelOriginalIds.includes(node.parent_id)
                    );
                }

                // 添加剩余的节点（可能存在循环引用或孤立节点）
                sortedNodes.push(...remaining);

                // 按顺序插入节点
                for (const node of sortedNodes) {
                    // 更新agent_id为新的智能体ID
                    node.agent_id = newAgentId;

                    // 更新parent_id：如果有父节点，使用映射后的新ID
                    if (node.parent_id && node.parent_id !== 0 && oldToNewIdMap.has(node.parent_id)) {
                        node.parent_id = oldToNewIdMap.get(node.parent_id);
                    }

                    // 找到原始节点ID
                    const originalNode = nodeList.find(originalNode => {
                        return Object.keys(node).every(key =>
                            key === 'agent_id' || key === 'parent_id' || originalNode[key] === node[key]
                        );
                    });

                    // 插入节点
                    const newNodeId = await new Promise((resolve, reject) => {
                        $.sm(function (re, err) {
                            if (err) {
                                reject(new Error('插入节点失败：' + err));
                            } else {
                                resolve(re);
                            }
                        }, ["w_agent_node.add", JSON.stringify(node)]);
                    });

                    // 记录新旧ID映射
                    if (originalNode) {
                        oldToNewIdMap.set(originalNode.id, newNodeId);
                    }
                }

                layer.msg('复制智能体及其节点成功');
                table.reload('agentTable');

            } catch (error) {
                throw new Error('复制智能体及节点失败：' + error.message);
            }
        }

        // 查看智能体的节点列表
        function nodeListFunc(agentId,agentName){
            jQuery.getparent().layer.open({
                type: 2,
                title: "智能体" + agentName + "对应的节点列表",
                shadeClose: false,
                area: ['1200px', '600px'],
                content: 'html/agent/node_list.html?v=' + Arg("v") + '&type=' + "add" + '&mid=' + Arg("mid") + "&id=" + agentId
            });
        }

        // 编辑节点直接跳转到HTML节点部分
        function jumpGraph(agent_id){
            var layer = jQuery.getparent().layer;
            let table = layui.table;
            console.log("点击了编辑节点："+agent_id);

            // 打开独立的流程图页面
            layer.open({
                type: 2,
                title: '节点流程图',
                maxmin: true, // 允许最大化和最小化
                area: ['60%', '90%'], // 设置更大的初始尺寸
                content: 'html/agent/node_graph.html?v=' + Arg("v") + '&mid=' + Arg("mid") + '&agent_id=' + agent_id,
                success: function (layero, index) {
                    // 页面加载成功后的回调
                    console.log('流程图页面加载成功');
                },
                end: function() {

                }
            });
        }
    }
})
```
