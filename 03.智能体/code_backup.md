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

### node_add_edit.js

#### 第一版

现在的代码结构混乱  因为经历了太多次的修改和编辑了

```js
/**
 * 作者：gongxi
 * 时间：2025-08-27
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

objdata = {
    nodeType: [
        {
            id: "1",
            name: "start",   // 开始节点
            title: "开始节点"
        },
        {
            id: "2",
            name: "process",  // 处理节点
            title: "处理节点"
        },
        {
            id: "3",
            name: "decision",  // 决策节点
            title: "决策节点"
        },
        {
            id: "4",
            name: "end",  // 结束节点
            title: "结束节点"
        },
        {
            id: "5",
            name: "default",  // 默认
            title: "默认节点"
        }
    ],
    selectType: "",
    pluginList: [],
    selectPlugin: "",
    nodeList: [],  // 节点列表
    selectParentNodeId: "", // 选中的父节点id
};

require(["jquery", "system", 'layui', 'layuicommon'], function () {
    layui.use(['form','layer', 'dropdown', 'upload'], function () {
        let form = layui.form;
        let upload = layui.upload;

        // 角色数据配置
        const roleData = {
            kindergarten_web: [
                {value: '系统管理员', title: '系统管理员',type: '1'},
                {value: '园长', title: '园长',type: '2'},
                {value: '教师', title: '教师',type: '3'},
                {value: '保健医', title: '保健医',type: '4'},
                {value: '财务', title: '财务',type: '5'},
                {value: '安保', title: '安保',type: '6'}
            ],
            parent_h5: [
                {value: '家长', title: '家长',type: '7'}
            ]
        };

        // 适用端数据配置
        const endData = {
            '全部': '全部',
            '幼儿园管理WEB': '幼儿园管理WEB',
            '家长端H5（后期拓展）': '家长端H5（后期拓展）'
        };

        // 存储选中的值
        let selectedEnds = [];
        let selectedRoles = [];
        let uploadedImageUrl = ''; // 存储上传后的图片地址

        // 封面类型切换
        form.on('radio(logoType)', function(data){
            const logoType = data.value;
            const customUploadSection = $('#customUploadSection');
            const uploadArea = $('#uploadArea');
            const uploadBtn = $('#uploadBtn');

            // 初始都隐藏
            customUploadSection.addClass('inactive');
            uploadArea.hide();
            uploadBtn.hide();

            if (logoType === 'custom') {
                // 选择自定义上传
                customUploadSection.removeClass('inactive');
                uploadArea.show();
                uploadBtn.show();
            } else if (logoType === 'plugin') {
                // 选择使用数据插件封面
                // 检查是否已关联插件
                const currentPluginId = $('.plugin').attr('data-id');
                if (!currentPluginId) {
                    // 没有关联插件，提示用户
                    layer.msg('还没有关联插件，请先关联插件', {icon: 2});
                    // 取消选中该单选框
                    $('input[name="logo_type"]').prop('checked', false);
                    form.render('radio');
                    return false;
                }

                uploadArea.hide();
                uploadBtn.hide();
                // 清除上传的图片
                $('#imagePreview').hide();
                uploadedImageUrl = '';
            }
        });

        // 自定义下拉框功能
        window.toggleDropdown = function(selectId) {
            const dropdown = $('#' + selectId + ' .select-dropdown');
            const selectInput = $('#' + selectId + ' .select-input');

            // 切换下拉框显示状态
            dropdown.toggleClass('show');
            selectInput.toggleClass('active');

            // 点击其他地方关闭下拉框
            if (dropdown.hasClass('show')) {
                $(document).on('click.dropdown', function(e) {
                    if (!$(e.target).closest('#' + selectId).length) {
                        dropdown.removeClass('show');
                        selectInput.removeClass('active');
                        $(document).off('click.dropdown');
                    }
                });
            }
        };

        // 更新标签显示
        function updateTags(selectId, selectedValues, dataMap) {
            const tagsContainer = $('#' + selectId + ' .selected-tags');
            const placeholder = $('#' + selectId + ' .placeholder');

            tagsContainer.empty();

            if (selectedValues.length > 0) {
                placeholder.hide();
                selectedValues.forEach(value => {
                    const label = dataMap[value] || value;
                    const tag = $(`
                        <div class="tag-item">
                            ${label}
                            <span class="remove-tag" onclick="removeTag('${selectId}', '${value}')">&times;</span>
                        </div>
                    `);
                    tagsContainer.append(tag);
                });
            } else {
                placeholder.show();
            }
        }

        // 移除标签
        window.removeTag = function(selectId, value) {
            if (selectId === 'applicableEndSelect') {
                selectedEnds = selectedEnds.filter(v => v !== value);
                updateTags('applicableEndSelect', selectedEnds, endData);
                updateRoleOptions();
                $('#hiddenApplicableEnd').val(selectedEnds.join(','));
            } else if (selectId === 'applicableRoleSelect') {
                selectedRoles = selectedRoles.filter(v => v !== value);
                updateTags('applicableRoleSelect', selectedRoles, getRoleDataMap());
                $('#hiddenApplicableRole').val(selectedRoles.join(','));
            }
        };

        // 获取角色数据映射
        function getRoleDataMap() {
            let roleMap = {};
            if (selectedEnds.includes('全部')) {
                roleMap['全部'] = '全部';
            } else {
                selectedEnds.forEach(end => {
                    // 根据适用端的中文名称来匹配角色数据
                    let endKey = '';
                    if (end === '幼儿园管理WEB') {
                        endKey = 'kindergarten_web';
                    } else if (end === '家长端H5（后期拓展）') {
                        endKey = 'parent_h5';
                    }

                    if (endKey && roleData[endKey]) {
                        roleData[endKey].forEach(role => {
                            roleMap[role.value] = role.title;
                        });
                    }
                });
            }
            return roleMap;
        }

        // 更新角色选项
        function updateRoleOptions() {
            const roleDropdown = $('#roleDropdown');
            roleDropdown.empty();

            // 清空已选择的角色（因为适用端改变了）
            selectedRoles = [];
            updateTags('applicableRoleSelect', selectedRoles, {});
            $('#hiddenApplicableRole').val('');

            if (selectedEnds.includes('全部')) {
                // 如果选择了全部，显示全部选项
                roleDropdown.append('<div class="option-item" data-value="全部">全部</div>');
                $('#rolePlaceholder').text('请选择适用角色');
            } else if (selectedEnds.length === 0) {
                // 如果没有选择适用端，显示提示
                $('#rolePlaceholder').text('请先选择适用端');
            } else {
                let allRoles = [];

                // 根据选择的适用端收集角色
                selectedEnds.forEach(end => {
                    let endKey = '';
                    if (end === '幼儿园管理WEB') {
                        endKey = 'kindergarten_web';
                    } else if (end === '家长端H5（后期拓展）') {
                        endKey = 'parent_h5';
                    }

                    if (endKey && roleData[endKey]) {
                        allRoles = allRoles.concat(roleData[endKey]);
                    }
                });

                // 去重并渲染
                const uniqueRoles = allRoles.filter((role, index, self) =>
                    index === self.findIndex(r => r.value === role.value)
                );

                uniqueRoles.forEach(role => {
                    roleDropdown.append(`<div class="option-item" data-value="${role.value}">${role.title}</div>`);
                });

                $('#rolePlaceholder').text('请选择适用角色');
            }
        }

        // 初始化下拉框事件
        function initDropdownEvents() {
            // 适用端选项点击事件
            $(document).on('click', '#endDropdown .option-item', function() {
                const value = $(this).data('value');

                if (value === '全部') {
                    // 如果点击全部，清空其他选择
                    selectedEnds = ['全部'];
                } else {
                    // 移除全部选项（如果存在）
                    selectedEnds = selectedEnds.filter(v => v !== '全部');

                    // 切换选择状态
                    if (selectedEnds.includes(value)) {
                        selectedEnds = selectedEnds.filter(v => v !== value);
                    } else {
                        selectedEnds.push(value);
                    }
                }

                updateTags('applicableEndSelect', selectedEnds, endData);
                updateRoleOptions();
                $('#hiddenApplicableEnd').val(selectedEnds.join(','));
            });

            // 适用角色选项点击事件
            $(document).on('click', '#roleDropdown .option-item', function() {
                const value = $(this).data('value');

                if (value === '全部') {
                    // 如果点击全部，清空其他选择
                    selectedRoles = ['全部'];
                } else {
                    // 移除全部选项（如果存在）
                    selectedRoles = selectedRoles.filter(v => v !== '全部');

                    // 切换选择状态
                    if (selectedRoles.includes(value)) {
                        selectedRoles = selectedRoles.filter(v => v !== value);
                    } else {
                        selectedRoles.push(value);
                    }
                }

                updateTags('applicableRoleSelect', selectedRoles, getRoleDataMap());
                $('#hiddenApplicableRole').val(selectedRoles.join(','));
            });
        }

        // 图片上传功能
        upload.render({
            elem: '#uploadBtn',
            url: '/upload/image', // 这里需要替换为实际的上传接口
            accept: 'images',
            acceptMime: 'image/png,image/jpg,image/jpeg',
            size: 1024, // 1MB
            before: function(obj) {
                // 预读本地文件示例，不支持ie8
                obj.preview(function(index, file, result) {
                    $('#imagePreview').attr('src', result).show();
                    $('#uploadText').hide();
                });
            },
            done: function(res) {
                // 如果上传失败
                if (res.code > 0) {
                    return layer.msg('上传失败');
                }
                // 上传成功，保存图片地址
                uploadedImageUrl = res.data.url || res.url; // 根据实际接口返回字段调整
                console.log('上传成功：', res);
                layer.msg('图片上传成功');
            },
            error: function() {
                // 演示失败状态，并实现重传
                var uploadText = $('#uploadText');
                uploadText.html('<span style="color: #FF5722;">上传失败</span> <a class="layui-btn layui-btn-xs demo-reload">重试</a>');
                uploadText.find('.demo-reload').on('click', function() {
                    upload.render({elem: '#uploadBtn'});
                });
            }
        });

        // 初始化类型选择和插件选择
        initDropdown()

        form.verify({
            node_name: (value) => {
                if(value !== ""){
                    agent_name = value;
                }
                return '请输入节点名称';
            },
            /* node_dsc: (value) => {
                 if (value) {
                     try {
                         JSON.parse(value);
                     } catch (e) {
                         return '参数必须是有效的 JSON 格式';
                     }
                 }
             },*/
            url: (value) => {
                if (value) {
                    var urlPattern = /^(https?:\/\/[^\s/$.?#].[^\s]*)$/i;
                    if (!urlPattern.test(value)) {
                        return '请输入有效的 HTTP 请求路径';
                    }
                }
            },
            parent_id: (value) => {
            },
            applicable_end: function(value, item) {
                if (selectedEnds.length === 0) {
                    return '请选择适用端';
                }
            },
            applicable_role: function(value, item) {
                if (selectedRoles.length === 0) {
                    return '请选择适用角色';
                }
            }
        });

        if (Arg("type") === "update"  && Arg("id") !== "") {
            var objwhere  = {}
            objwhere.id = [Arg("id")];
            $.sm((re, err) => {
                if (err) {
                    layer.msg(err);
                } else {
                    var data = re[0];

                    form.val('formOk', {
                        "node_name": data.node_name,
                        "node_dsc": data.node_dsc,
                        // 需要将 node_type 数字对应的中文
                        "node_type": data.node_type,
                        "url": data.url,
                        "plugin": data.plugin_id,
                        "parent_id": (data.parent_id === 0 || data.parent_id === null) ? "" : data.parent_id,
                        "status": data.status.toString()
                    });

                    // 设置下拉选择器的显示值
                    setSelectedNodeType(data.node_type);
                    setSelectedPlugin(data.plugin_id);
                    setSelectedParentNode(data.parent_id);
                    setNodeLogo(data.logo);

                    // 设置适用端
                    if (data.applicable_end) {
                        const applicableEndsStr = typeof data.applicable_end === 'string'
                            ? data.applicable_end
                            : data.applicable_end.toString();

                        // 从逗号分割的字符串中解析
                        selectedEnds = applicableEndsStr.split(',').filter(item => item.trim() !== '');
                        updateTags('applicableEndSelect', selectedEnds, endData);
                        $('#hiddenApplicableEnd').val(selectedEnds.join(','));

                        // 更新角色选项
                        updateRoleOptions();

                        // 设置适用角色
                        setTimeout(() => {
                            if (data.applicable_role) {
                                const applicableRolesStr = typeof data.applicable_role === 'string'
                                    ? data.applicable_role
                                    : data.applicable_role.toString();

                                // 从逗号分割的字符串中解析
                                selectedRoles = applicableRolesStr.split(',').filter(item => item.trim() !== '');
                                updateTags('applicableRoleSelect', selectedRoles, getRoleDataMap());
                                $('#hiddenApplicableRole').val(selectedRoles.join(','));
                            }

                            form.render();
                        }, 100);
                    }

                    // 移除原有的图片设置逻辑，因为已经在上面的logo处理中包含了
                }
            }, ["w_agent_node.selectById", $.msgwhere(objwhere)]);
        }else if (Arg("type") === "addChildNode" && Arg("agent_id") !== "" && Arg("parent_id") !== "") {
            form.val('formOk', {
                "node_name": "",
                "node_dsc": "",
                "node_type": "",
                "url": "",
                "parent_id": ""
            });
            // 回显原本的父节点内容和
            setSelectedParentNode(Arg("parent_id"))
        }

        // 初始化下拉框事件
        initDropdownEvents();

        // 初始化时渲染角色选项（默认为空）
        updateRoleOptions();

        form.render();

        $("#saveOK").click(function (event, callback) {
            // 手动验证多选必填项
            if (selectedEnds.length === 0) {
                layer.msg('请选择适用端');
                return false;
            }

            if (selectedRoles.length === 0) {
                layer.msg('请选择适用角色');
                return false;
            }

            form.submit('formOk', function (data) {
                // 构建提交数据 - 统一使用逗号分割的字符串格式
                console.log("表单数据",data.field);
                var submitData = {
                    node_name: data.field.node_name,
                    node_dsc: data.field.node_dsc,
                    node_type: data.field.node_type,
                    url: data.field.url,
                    plugin_id: data.field.plugin_id,
                    parent_id: data.field.parent_id,
                    applicable_end: selectedEnds.join(','),
                    applicable_role: selectedRoles.join(','),
                    status: data.field.status,
                };

                // 处理logo字段
                const logoType = $('input[name="logo_type"]:checked').val();
                if (logoType === 'plugin') {
                    // 使用插件ID作为logo
                    const pluginId = $('.plugin').attr('data-id');
                    submitData.logo = pluginId;
                } else if (logoType === 'custom' && uploadedImageUrl) {
                    // 使用上传的图片URL作为logo
                    submitData.logo = uploadedImageUrl;
                } else {
                    // 没有设置logo
                    submitData.logo = '';
                }

                if (Arg("type") === "add") {
                    addFn(submitData);
                } else if (Arg("type") === "update") {
                    updateFn(submitData);
                }else if (Arg("type") === "addChildNode") {
                    // 拿智能体id 和 父节点id
                    let agent_id = Arg("agent_id");
                    let parent_id = Arg("parent_id");
                    addChildNode(submitData, agent_id, parent_id);
                }
                return false;
            });
        });
    });

    // 修改initDropdown函数
    function initDropdown(){
        var dropdown = layui.dropdown;

        dropdown.render({
            elem: '#nodeTypeSelect',
            data: objdata.nodeType,
            click: function (data, othis) {
                $('.node_type').val(data.title);  // 显示中文名称
                $('.node_type').attr('data-id', data.id);  // 将ID存储在data属性中
                $('.node_type').attr('placeholder', '');  // 清空placeholder
                // 保存选中的类型
                objdata.selectType = data.name;
            }
        });

        // 获取插件列表和节点列表  并初始化插件下拉框和父节点下拉框
        $.sm((re, err) => {
            if (err) {
                layer.msg(err);
            } else {
                console.log(re);
                // 将获取到的插件数据转换为标准格式
                const pluginData = re[0].map(item => ({
                    id: item.id,
                    title: item.plugin_name + '(ID:' + item.id + ')',
                    plugin_name: item.plugin_name
                }));

                // 存储插件列表到objdata中
                objdata.pluginList = pluginData;

                // 渲染插件下拉框
                dropdown.render({
                    elem: '#pluginSelect',
                    data: pluginData,
                    click: function (data, othis) {
                        $('.plugin').val(data.title);  // 显示插件名称
                        $('.plugin').attr('data-id', data.id);  // 将ID存储在data属性中
                        $('.plugin').attr('placeholder', '');  // 清空placeholder
                        // 保存选中的插件ID
                        objdata.selectPlugin = data.id;
                    }
                });
                // 将获取到的节点数据转换为标准格式
                const nodeData = re[1].map(item => ({
                    id: item.id,
                    title: item.node_name + '(ID:' + item.id + ')',
                    node_name: item.node_name
                }));
                objdata.nodeList = nodeData;

                dropdown.render({
                    elem: '#parentNodeSelect',
                    data: nodeData,
                    click: function (data, othis) {
                        $('.parent_node').val(data.title);  // 显示节点名称
                        $('.parent_node').attr('data-id', data.id);  // 将ID存储在data属性中
                        $('.parent_node').attr('placeholder', '');  // 清空placeholder
                        // 存储选中的父节点ID
                        objdata.selectParentNodeId = data.id;
                    }
                })
            }
        }, [
            ["w_plugin.getIdAndName"],
            ["w_agent_node.getIdAndName"]
        ],{ msgid :"node_plugin_batch"});
    }

    function setSelectedNodeType(nodeTypeId) {
        var selectedType = objdata.nodeType.find(type => type.id === nodeTypeId);
        if (selectedType) {
            $('.node_type').val(selectedType.title);  // 显示中文名称
            $('.node_type').attr('data-id', selectedType.id);  // 存储ID
            $('.node_type').attr('placeholder', '');
            objdata.selectType = selectedType.name;
        }
    }

    function setSelectedPlugin(pluginId){
        // 确保pluginList已经加载
        if (objdata.pluginList.length === 0) {
            // 如果插件列表还没加载，延迟执行
            setTimeout(() => setSelectedPlugin(pluginId), 100);
            return;
        }

        var selectedPlugin = objdata.pluginList.find(plugin => plugin.id == pluginId); // 使用==比较，因为可能存在类型转换
        if (selectedPlugin) {
            $('.plugin').val(selectedPlugin.title);  // 显示插件名称
            $('.plugin').attr('data-id', selectedPlugin.id);  // 存储ID
            $('.plugin').attr('placeholder', '');
            objdata.selectPlugin = selectedPlugin.id;  // 修正：存储ID而不是title
        }else{
            // 说明没有绑定插件  设置为无
            $('.plugin').val('');
        }

    }
    function setSelectedParentNode(parentNodeId) {
        // 确保nodeList已经加载
        if (objdata.nodeList.length === 0) {
            // 如果节点列表还没加载，延迟执行
            setTimeout(() => setSelectedParentNode(parentNodeId), 100);
        }
        var selectedNode = objdata.nodeList.find(node => node.id == parentNodeId);
        if (selectedNode) {
            console.log(selectedNode);
            $('.parent_node').val(selectedNode.title);  // 显示节点名称
            $('.parent_node').attr('data-id', selectedNode.id);  // 存储ID
            $('.parent_node').attr('placeholder', '');
            objdata.selectParentNodeId = selectedNode.id;
        }else{
            $('.parent_node').val('');
        }
    }
    function setNodeLogo(nodeLogo){
        var form = layui.form;
        // TODO: 处理logo回显逻辑
        if (nodeLogo) {
            // 判断logo是否为纯数字（插件ID）
            if (/^\d+$/.test(nodeLogo.toString())) {
                // 纯数字，说明是插件ID，选中plugin单选框
                $('input[name="logo_type"][value="plugin"]').prop('checked', true);
                form.render('radio');
            } else if(nodeLogo) { // 不是纯数字，说明是图片URL，选中custom单选框并显示图片

                $('input[name="logo_type"][value="custom"]').prop('checked', true);
                uploadedImageUrl = nodeLogo;
                $('#imagePreview').attr('src', nodeLogo).show();
                $('#uploadText').hide();

                // 显示上传区域
                const customUploadSection = $('#customUploadSection');
                const uploadArea = $('#uploadArea');
                const uploadBtn = $('#uploadBtn');
                customUploadSection.removeClass('inactive');
                uploadArea.show();
                uploadBtn.show();

                form.render('radio');
            }else{  // todo 得到的logo为空的情况 单选框不设置选中状态

            }
        }
    }

    function addFn(data) {
        data.agent_id = Arg("id");
        $.sm((re, err) => {
            if (err) {
                layer.msg(err);
            } else {
                layer.msg("添加智能体节点成功！");
            }
        }, ["w_agent_node.add", JSON.stringify(filterData( data))]);
    }

    function updateFn(data) {
        $.sm((re, err) => {
            if (err) {
                layer.msg(err);
            } else {
                layer.msg("修改节点成功");
            }
        }, ["w_agent_node.update", JSON.stringify(filterData( data)), $.msgwhere({id: [Arg("id")]})]);
    }

    // 添加子节点
    function addChildNode(data,agent_id, parent_id) {
        data.agent_id = agent_id;

        $.sm((re, err) => {
            if (err) {
                layer.msg(err);
            }else {
                layer.msg("添加子节点成功！");
            }
        }, ["w_agent_node.add", JSON.stringify(filterData(data))])
    }

    // 过滤数据
    function filterData(data) {
        // 获取真正的节点类型ID（从data-id属性中获取）
        var nodeTypeId = $('.node_type').attr('data-id');
        if (nodeTypeId) {
            data.node_type = parseInt(nodeTypeId);
        }else{
            data.node_type = 5; // 默认类型
        }

        // 获取真正的插件ID（从data-id属性中获取）
        var pluginId = $('.plugin').attr('data-id');
        if (pluginId) {
            data.plugin_id = pluginId;
        }
        // 获取真正的父节点ID（从data-id属性中获取）
        var parentNodeId = $('.parent_node').attr('data-id');
        if (parentNodeId) {
            data.parent_id = parentNodeId;
        }

        return data;
    }

});
```

#### 第二版

```js
/**
 * 作者：gongxi
 * 时间：2025-08-27
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

// 全局数据对象，统一管理所有数据
objdata = {
    nodeType: [
        {
            id: "1",
            name: "start",   // 开始节点
            title: "开始节点"
        },
        {
            id: "2",
            name: "process",  // 处理节点
            title: "处理节点"
        },
        {
            id: "3",
            name: "decision",  // 决策节点
            title: "决策节点"
        },
        {
            id: "4",
            name: "end",  // 结束节点
            title: "结束节点"
        },
        {
            id: "5",
            name: "default",  // 默认
            title: "默认节点"
        }
    ],
    selectType: "",
    pluginList: [],
    selectPlugin: "",
    nodeList: [],  // 节点列表
    selectParentNodeId: "", // 选中的父节点id

    // 角色数据配置
    roleData: {
        kindergarten_web: [
            {value: '系统管理员', title: '系统管理员', type: '1'},
            {value: '园长', title: '园长', type: '2'},
            {value: '教师', title: '教师', type: '3'},
            {value: '保健医', title: '保健医', type: '4'},
            {value: '财务', title: '财务', type: '5'},
            {value: '安保', title: '安保', type: '6'}
        ],
        parent_h5: [
            {value: '家长', title: '家长', type: '7'}
        ]
    },

    // 适用端数据配置
    endData: {
        '全部': '全部',
        '幼儿园管理WEB': '幼儿园管理WEB',
        '家长端H5（后期拓展）': '家长端H5（后期拓展）'
    },

    // 存储选中的值
    selectedEnds: [],
    selectedRoles: [],
    uploadedImageUrl: '' // 存储上传后的图片地址
};

require(["jquery", "system", 'layui', 'layuicommon'], function () {
    layui.use(['form','layer', 'dropdown', 'upload'], function () {
        let form = layui.form;
        let upload = layui.upload;

        // ========== 初始化函数 ==========

        // 初始化下拉框
        function initDropdown(){
            var dropdown = layui.dropdown;

            dropdown.render({
                elem: '#nodeTypeSelect',
                data: objdata.nodeType,
                click: function (data, othis) {
                    $('.node_type').val(data.title);  // 显示中文名称
                    $('.node_type').attr('data-id', data.id);  // 将ID存储在data属性中
                    $('.node_type').attr('placeholder', '');  // 清空placeholder
                    // 保存选中的类型
                    objdata.selectType = data.name;
                }
            });

            // 获取插件列表和节点列表 并初始化插件下拉框和父节点下拉框
            $.sm((re, err) => {
                if (err) {
                    layer.msg(err);
                } else {
                    console.log(re);
                    // 将获取到的插件数据转换为标准格式
                    const pluginData = re[0].map(item => ({
                        id: item.id,
                        title: item.plugin_name + '(ID:' + item.id + ')',
                        plugin_name: item.plugin_name
                    }));

                    // 存储插件列表到objdata中
                    objdata.pluginList = pluginData;

                    // 渲染插件下拉框
                    dropdown.render({
                        elem: '#pluginSelect',
                        data: pluginData,
                        click: function (data, othis) {
                            $('.plugin').val(data.title);  // 显示插件名称
                            $('.plugin').attr('data-id', data.id);  // 将ID存储在data属性中
                            $('.plugin').attr('placeholder', '');  // 清空placeholder
                            // 保存选中的插件ID
                            objdata.selectPlugin = data.id;
                        }
                    });

                    // 将获取到的节点数据转换为标准格式
                    const nodeData = re[1].map(item => ({
                        id: item.id,
                        title: item.node_name + '(ID:' + item.id + ')',
                        node_name: item.node_name
                    }));
                    objdata.nodeList = nodeData;

                    dropdown.render({
                        elem: '#parentNodeSelect',
                        data: nodeData,
                        click: function (data, othis) {
                            $('.parent_node').val(data.title);  // 显示节点名称
                            $('.parent_node').attr('data-id', data.id);  // 将ID存储在data属性中
                            $('.parent_node').attr('placeholder', '');  // 清空placeholder
                            // 存储选中的父节点ID
                            objdata.selectParentNodeId = data.id;
                        }
                    })
                }
            }, [
                ["w_plugin.getIdAndName"],
                ["w_agent_node.getIdAndName"]
            ],{ msgid :"node_plugin_batch"});
        }

        // 初始化下拉框事件
        function initDropdownEvents() {
            // 适用端选项点击事件
            $(document).on('click', '#endDropdown .option-item', function() {
                const value = $(this).data('value');

                if (value === '全部') {
                    // 如果点击全部，清空其他选择
                    objdata.selectedEnds = ['全部'];
                } else {
                    // 移除全部选项（如果存在）
                    objdata.selectedEnds = objdata.selectedEnds.filter(v => v !== '全部');

                    // 切换选择状态
                    if (objdata.selectedEnds.includes(value)) {
                        objdata.selectedEnds = objdata.selectedEnds.filter(v => v !== value);
                    } else {
                        objdata.selectedEnds.push(value);
                    }
                }

                updateTags('applicableEndSelect', objdata.selectedEnds, objdata.endData);
                updateRoleOptions();
                $('#hiddenApplicableEnd').val(objdata.selectedEnds.join(','));
            });

            // 适用角色选项点击事件
            $(document).on('click', '#roleDropdown .option-item', function() {
                const value = $(this).data('value');

                if (value === '全部') {
                    // 如果点击全部，清空其他选择
                    objdata.selectedRoles = ['全部'];
                } else {
                    // 移除全部选项（如果存在）
                    objdata.selectedRoles = objdata.selectedRoles.filter(v => v !== '全部');

                    // 切换选择状态
                    if (objdata.selectedRoles.includes(value)) {
                        objdata.selectedRoles = objdata.selectedRoles.filter(v => v !== value);
                    } else {
                        objdata.selectedRoles.push(value);
                    }
                }

                updateTags('applicableRoleSelect', objdata.selectedRoles, getRoleDataMap());
                $('#hiddenApplicableRole').val(objdata.selectedRoles.join(','));
            });
        }

        // ========== 工具函数 ==========

        // 自定义下拉框功能
        window.toggleDropdown = function(selectId) {
            const dropdown = $('#' + selectId + ' .select-dropdown');
            const selectInput = $('#' + selectId + ' .select-input');

            // 切换下拉框显示状态
            dropdown.toggleClass('show');
            selectInput.toggleClass('active');

            // 点击其他地方关闭下拉框
            if (dropdown.hasClass('show')) {
                $(document).on('click.dropdown', function(e) {
                    if (!$(e.target).closest('#' + selectId).length) {
                        dropdown.removeClass('show');
                        selectInput.removeClass('active');
                        $(document).off('click.dropdown');
                    }
                });
            }
        };

        // 更新标签显示
        function updateTags(selectId, selectedValues, dataMap) {
            const tagsContainer = $('#' + selectId + ' .selected-tags');
            const placeholder = $('#' + selectId + ' .placeholder');

            tagsContainer.empty();

            if (selectedValues.length > 0) {
                placeholder.hide();
                selectedValues.forEach(value => {
                    const label = dataMap[value] || value;
                    const tag = $(`
                        <div class="tag-item">
                            ${label}
                            <span class="remove-tag" onclick="removeTag('${selectId}', '${value}')">&times;</span>
                        </div>
                    `);
                    tagsContainer.append(tag);
                });
            } else {
                placeholder.show();
            }
        }

        // 移除标签
        window.removeTag = function(selectId, value) {
            if (selectId === 'applicableEndSelect') {
                objdata.selectedEnds = objdata.selectedEnds.filter(v => v !== value);
                updateTags('applicableEndSelect', objdata.selectedEnds, objdata.endData);
                updateRoleOptions();
                $('#hiddenApplicableEnd').val(objdata.selectedEnds.join(','));
            } else if (selectId === 'applicableRoleSelect') {
                objdata.selectedRoles = objdata.selectedRoles.filter(v => v !== value);
                updateTags('applicableRoleSelect', objdata.selectedRoles, getRoleDataMap());
                $('#hiddenApplicableRole').val(objdata.selectedRoles.join(','));
            }
        };

        // 获取角色数据映射
        function getRoleDataMap() {
            let roleMap = {};
            if (objdata.selectedEnds.includes('全部')) {
                roleMap['全部'] = '全部';
            } else {
                objdata.selectedEnds.forEach(end => {
                    // 根据适用端的中文名称来匹配角色数据
                    let endKey = '';
                    if (end === '幼儿园管理WEB') {
                        endKey = 'kindergarten_web';
                    } else if (end === '家长端H5（后期拓展）') {
                        endKey = 'parent_h5';
                    }

                    if (endKey && objdata.roleData[endKey]) {
                        objdata.roleData[endKey].forEach(role => {
                            roleMap[role.value] = role.title;
                        });
                    }
                });
            }
            return roleMap;
        }

        // 更新角色选项
        function updateRoleOptions() {
            const roleDropdown = $('#roleDropdown');
            roleDropdown.empty();

            // 清空已选择的角色（因为适用端改变了）
            objdata.selectedRoles = [];
            updateTags('applicableRoleSelect', objdata.selectedRoles, {});
            $('#hiddenApplicableRole').val('');

            if (objdata.selectedEnds.includes('全部')) {
                // 如果选择了全部，显示全部选项
                roleDropdown.append('<div class="option-item" data-value="全部">全部</div>');
                $('#rolePlaceholder').text('请选择适用角色');
            } else if (objdata.selectedEnds.length === 0) {
                // 如果没有选择适用端，显示提示
                $('#rolePlaceholder').text('请先选择适用端');
            } else {
                let allRoles = [];

                // 根据选择的适用端收集角色
                objdata.selectedEnds.forEach(end => {
                    let endKey = '';
                    if (end === '幼儿园管理WEB') {
                        endKey = 'kindergarten_web';
                    } else if (end === '家长端H5（后期拓展）') {
                        endKey = 'parent_h5';
                    }

                    if (endKey && objdata.roleData[endKey]) {
                        allRoles = allRoles.concat(objdata.roleData[endKey]);
                    }
                });

                // 去重并渲染
                const uniqueRoles = allRoles.filter((role, index, self) =>
                    index === self.findIndex(r => r.value === role.value)
                );

                uniqueRoles.forEach(role => {
                    roleDropdown.append(`<div class="option-item" data-value="${role.value}">${role.title}</div>`);
                });

                $('#rolePlaceholder').text('请选择适用角色');
            }
        }

        // ========== 设置选中值的函数 ==========

        function setSelectedNodeType(nodeTypeId) {
            var selectedType = objdata.nodeType.find(type => type.id === nodeTypeId);
            if (selectedType) {
                $('.node_type').val(selectedType.title);  // 显示中文名称
                $('.node_type').attr('data-id', selectedType.id);  // 存储ID
                $('.node_type').attr('placeholder', '');
                objdata.selectType = selectedType.name;
            }
        }

        function setSelectedPlugin(pluginId){
            // 确保pluginList已经加载
            if (objdata.pluginList.length === 0) {
                // 如果插件列表还没加载，延迟执行
                setTimeout(() => setSelectedPlugin(pluginId), 100);
                return;
            }

            var selectedPlugin = objdata.pluginList.find(plugin => plugin.id == pluginId); // 使用==比较，因为可能存在类型转换
            if (selectedPlugin) {
                $('.plugin').val(selectedPlugin.title);  // 显示插件名称
                $('.plugin').attr('data-id', selectedPlugin.id);  // 存储ID
                $('.plugin').attr('placeholder', '');
                objdata.selectPlugin = selectedPlugin.id;  // 修正：存储ID而不是title
            } else {
                // 说明没有绑定插件 设置为无
                $('.plugin').val('');
            }
        }

        function setSelectedParentNode(parentNodeId) {
            // 确保nodeList已经加载
            if (objdata.nodeList.length === 0) {
                // 如果节点列表还没加载，延迟执行
                setTimeout(() => setSelectedParentNode(parentNodeId), 100);
                return;
            }
            var selectedNode = objdata.nodeList.find(node => node.id == parentNodeId);
            if (selectedNode) {
                console.log(selectedNode);
                $('.parent_node').val(selectedNode.title);  // 显示节点名称
                $('.parent_node').attr('data-id', selectedNode.id);  // 存储ID
                $('.parent_node').attr('placeholder', '');
                objdata.selectParentNodeId = selectedNode.id;
            } else {
                $('.parent_node').val('');
            }
        }

        function setNodeLogo(nodeLogo){
            var form = layui.form;

            if (!nodeLogo || nodeLogo === '' || nodeLogo === null || nodeLogo === undefined) {
                // logo为空的情况，不设置任何单选框选中状态
                $('input[name="logo_type"]').prop('checked', false);
                // 隐藏所有相关区域
                $('#customUploadSection').addClass('inactive');
                $('#uploadArea').hide();
                $('#uploadBtn').hide();
                $('#imagePreview').hide();
                objdata.uploadedImageUrl = '';
                form.render('radio');
                return;
            }

            // 判断logo是否为纯数字（插件ID）
            if (/^\d+$/.test(nodeLogo.toString())) {
                // 纯数字，说明是插件ID
                // 检查是否有对应的插件
                const hasPlugin = objdata.pluginList.some(plugin => plugin.id == nodeLogo);
                if (hasPlugin) {
                    // 有对应插件，选中plugin单选框
                    $('input[name="logo_type"][value="plugin"]').prop('checked', true);
                    // 隐藏上传区域
                    $('#customUploadSection').addClass('inactive');
                    $('#uploadArea').hide();
                    $('#uploadBtn').hide();
                    $('#imagePreview').hide();
                    objdata.uploadedImageUrl = '';
                } else {
                    // 没有对应插件，视为无效logo，不设置任何选中状态
                    $('input[name="logo_type"]').prop('checked', false);
                    $('#customUploadSection').addClass('inactive');
                    $('#uploadArea').hide();
                    $('#uploadBtn').hide();
                    $('#imagePreview').hide();
                    objdata.uploadedImageUrl = '';
                }
            } else {
                // 不是纯数字，说明是图片URL，选中custom单选框并显示图片
                $('input[name="logo_type"][value="custom"]').prop('checked', true);
                objdata.uploadedImageUrl = nodeLogo;
                $('#imagePreview').attr('src', nodeLogo).show();
                $('#uploadText').hide();

                // 显示上传区域
                const customUploadSection = $('#customUploadSection');
                const uploadArea = $('#uploadArea');
                const uploadBtn = $('#uploadBtn');
                customUploadSection.removeClass('inactive');
                uploadArea.show();
                uploadBtn.show();
            }

            form.render('radio');
        }

        // ========== 业务处理函数 ==========

        // 过滤数据
        function filterData(data) {
            // 获取真正的节点类型ID（从data-id属性中获取）
            var nodeTypeId = $('.node_type').attr('data-id');
            if (nodeTypeId) {
                data.node_type = parseInt(nodeTypeId);
            } else {
                data.node_type = 5; // 默认类型
            }

            // 获取真正的插件ID（从data-id属性中获取）
            var pluginId = $('.plugin').attr('data-id');
            if (pluginId) {
                data.plugin_id = pluginId;
            } else {
                // 如果没有选择插件，设置为空或null
                data.plugin_id = null;
            }

            // 获取真正的父节点ID（从data-id属性中获取）
            var parentNodeId = $('.parent_node').attr('data-id');
            if (parentNodeId) {
                data.parent_id = parentNodeId;
            } else {
                data.parent_id = null;
            }

            return data;
        }

        function addFn(data) {
            data.agent_id = Arg("id");
            $.sm((re, err) => {
                if (err) {
                    layer.msg(err);
                } else {
                    layer.msg("添加智能体节点成功！");
                }
            }, ["w_agent_node.add", JSON.stringify(filterData(data))]);
        }

        function updateFn(data) {
            $.sm((re, err) => {
                if (err) {
                    layer.msg(err);
                } else {
                    layer.msg("修改节点成功");
                }
            }, ["w_agent_node.update", JSON.stringify(filterData(data)), $.msgwhere({id: [Arg("id")]})]);
        }

        // 添加子节点
        function addChildNode(data, agent_id, parent_id) {
            data.agent_id = agent_id;

            $.sm((re, err) => {
                if (err) {
                    layer.msg(err);
                } else {
                    layer.msg("添加子节点成功！");
                }
            }, ["w_agent_node.add", JSON.stringify(filterData(data))])
        }

        // ========== 事件绑定 ==========

        // 封面类型切换 TODO  默认选择custom  如果用户选择了关联数据插件，那么默认选择 plugin，否则提交表单部分会出问题
        form.on('radio(logoType)', function(data){
            const logoType = data.value;
            const customUploadSection = $('#customUploadSection');
            const uploadArea = $('#uploadArea');
            const uploadBtn = $('#uploadBtn');

            // 初始都隐藏
            customUploadSection.addClass('inactive');
            uploadArea.hide();
            uploadBtn.hide();

            if (logoType === 'custom') {
                // 选择自定义上传
                customUploadSection.removeClass('inactive');
                uploadArea.show();
                uploadBtn.show();
            } else if (logoType === 'plugin') {
                // 选择使用数据插件封面
                // 检查是否已关联插件
                const currentPluginId = $('.plugin').attr('data-id');
                if (!currentPluginId) {
                    // 没有关联插件，提示用户
                    layer.msg('还没有关联插件，请先关联插件', {icon: 2});
                    // 取消选中该单选框
                    $('input[name="logo_type"]').prop('checked', false);
                    form.render('radio');
                    return false;
                }

                uploadArea.hide();
                uploadBtn.hide();
                // 清除上传的图片
                $('#imagePreview').hide();
                objdata.uploadedImageUrl = '';
            }
        });

        // 图片上传功能
        upload.render({
            elem: '#uploadBtn',
            url: '/upload/image', // 这里需要替换为实际的上传接口
            accept: 'images',
            acceptMime: 'image/png,image/jpg,image/jpeg',
            size: 1024, // 1MB
            before: function(obj) {
                // 预读本地文件示例，不支持ie8
                obj.preview(function(index, file, result) {
                    $('#imagePreview').attr('src', result).show();
                    $('#uploadText').hide();
                });
            },
            done: function(res) {
                // 如果上传失败
                if (res.code > 0) {
                    return layer.msg('上传失败');
                }
                // 上传成功，保存图片地址
                objdata.uploadedImageUrl = res.data.url || res.url; // 根据实际接口返回字段调整
                console.log('上传成功：', res);
                layer.msg('图片上传成功');
            },
            error: function() {
                // 演示失败状态，并实现重传
                var uploadText = $('#uploadText');
                uploadText.html('<span style="color: #FF5722;">上传失败</span> <a class="layui-btn layui-btn-xs demo-reload">重试</a>');
                uploadText.find('.demo-reload').on('click', function() {
                    upload.render({elem: '#uploadBtn'});
                });
            }
        });

        // 表单验证
        form.verify({
            node_name: (value) => {
                if(value !== ""){
                    agent_name = value;
                }
                return '请输入节点名称';
            },
            url: (value) => {
                if (value) {
                    var urlPattern = /^(https?:\/\/[^\s/$.?#].[^\s]*)$/i;
                    if (!urlPattern.test(value)) {
                        return '请输入有效的 HTTP 请求路径';
                    }
                }
            },
            parent_id: (value) => {
            },
            applicable_end: function(value, item) {
                if (objdata.selectedEnds.length === 0) {
                    return '请选择适用端';
                }
            },
            applicable_role: function(value, item) {
                if (objdata.selectedRoles.length === 0) {
                    return '请选择适用角色';
                }
            }
        });

        // ========== 页面初始化 ==========

        // 初始化下拉框类型选择和插件选择
        initDropdown();

        // 初始化下拉框事件
        initDropdownEvents();

        // 初始化时渲染角色选项（默认为空）
        updateRoleOptions();

        // 根据页面类型进行不同的初始化
        if (Arg("type") === "update" && Arg("id") !== "") {
            var objwhere = {}
            objwhere.id = [Arg("id")];
            $.sm((re, err) => {
                if (err) {
                    layer.msg(err);
                } else {
                    var data = re[0];

                    form.val('formOk', {
                        "node_name": data.node_name,
                        "node_dsc": data.node_dsc,
                        "node_type": data.node_type,
                        "url": data.url,
                        "plugin": data.plugin_id,
                        "parent_id": (data.parent_id === 0 || data.parent_id === null) ? "" : data.parent_id,
                        "status": data.status.toString()
                    });

                    // 设置下拉选择器的显示值
                    setSelectedNodeType(data.node_type);
                    setSelectedPlugin(data.plugin_id);
                    setSelectedParentNode(data.parent_id);

                    // 延迟设置logo，确保插件列表已加载
                    setTimeout(() => {
                        setNodeLogo(data.logo);
                    }, 200);

                    // 设置适用端
                    if (data.applicable_end) {
                        const applicableEndsStr = typeof data.applicable_end === 'string'
                            ? data.applicable_end
                            : data.applicable_end.toString();

                        // 从逗号分割的字符串中解析
                        objdata.selectedEnds = applicableEndsStr.split(',').filter(item => item.trim() !== '');
                        updateTags('applicableEndSelect', objdata.selectedEnds, objdata.endData);
                        $('#hiddenApplicableEnd').val(objdata.selectedEnds.join(','));

                        // 更新角色选项
                        updateRoleOptions();

                        // 设置适用角色
                        setTimeout(() => {
                            if (data.applicable_role) {
                                const applicableRolesStr = typeof data.applicable_role === 'string'
                                    ? data.applicable_role
                                    : data.applicable_role.toString();

                                // 从逗号分割的字符串中解析
                                objdata.selectedRoles = applicableRolesStr.split(',').filter(item => item.trim() !== '');
                                updateTags('applicableRoleSelect', objdata.selectedRoles, getRoleDataMap());
                                $('#hiddenApplicableRole').val(objdata.selectedRoles.join(','));
                            }

                            form.render();
                        }, 100);
                    }
                }
            }, ["w_agent_node.selectById", $.msgwhere(objwhere)]);
        } else if (Arg("type") === "addChildNode" && Arg("agent_id") !== "" && Arg("parent_id") !== "") {
            form.val('formOk', {
                "node_name": "",
                "node_dsc": "",
                "node_type": "",
                "url": "",
                "parent_id": ""
            });
            // 回显原本的父节点内容
            setSelectedParentNode(Arg("parent_id"));
        }

        form.render();

        // 保存按钮点击事件
        $("#saveOK").click(function (event, callback) {
            // 手动验证多选必填项
            if (objdata.selectedEnds.length === 0) {
                layer.msg('请选择适用端');
                return false;
            }

            if (objdata.selectedRoles.length === 0) {
                layer.msg('请选择适用角色');
                return false;
            }

            form.submit('formOk', function (data) {
                // 构建提交数据 - 统一使用逗号分割的字符串格式
                console.log("表单数据", data.field);
                var submitData = {
                    node_name: data.field.node_name,
                    node_dsc: data.field.node_dsc,
                    node_type: data.field.node_type,
                    url: data.field.url,
                    plugin_id: data.field.plugin_id,
                    parent_id: data.field.parent_id,
                    applicable_end: objdata.selectedEnds.join(','),
                    applicable_role: objdata.selectedRoles.join(','),
                    status: data.field.status,
                };

                // 处理logo字段
                const logoType = $('input[name="logo_type"]:checked').val();
                if (logoType === 'plugin') {
                    // 使用插件ID作为logo
                    const pluginId = $('.plugin').attr('data-id');
                    if (pluginId) {
                        submitData.logo = pluginId;
                    } else {
                        submitData.logo = '';
                    }
                } else if (logoType === 'custom' && objdata.uploadedImageUrl) {
                    // 使用上传的图片URL作为logo
                    submitData.logo = objdata.uploadedImageUrl;
                } else {
                    // 没有设置logo或选择了无效选项
                    submitData.logo = '';
                }

                if (Arg("type") === "add") {
                    addFn(submitData);
                } else if (Arg("type") === "update") {
                    updateFn(submitData);
                } else if (Arg("type") === "addChildNode") {
                    // 拿智能体id 和 父节点id
                    let agent_id = Arg("agent_id");
                    let parent_id = Arg("parent_id");
                    addChildNode(submitData, agent_id, parent_id);
                }
                return false;
            });
        });
    });
});
```



### agent_add_edit.js

提交过的代码，但是存在logo设置和回显存在bug，而且代码结构混乱

处理一下得到logo为空的情况，同时添加或者更新节点信息的时候，如果选择了关联插件，那么单选框默认选择使用数据插件内容，回显部分也得优化一下代码结构，调整整体代码顺序，将角色数据配置和适用端配置以及选中的值，给我放到objdata中，使代码结构更流畅,todo里面提供了logo相关的处理思路，上传部分的todo不用处理

```js
/**
 * 作者：gongxi
 * 时间： - 添加原型图功能实现
 * 更新：2025-08-26 - 添加数据插件下拉框功能
 * 更新：2025-08-28 - 完善logo回显逻辑
 */
require.config({
    paths: {
        jquery: '../../sys/jquery',
        system: '../../sys/system',
        layui: "../../layui-btkj/layui",
        layuicommon: "../../sys/layuicommon",
        uploadFileUtil: "../../sys/uploadutil",
        uploadoss:"../../plugin/cropper/js/uploadoss"
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


require(["jquery", "system", 'layui', 'layuicommon', 'uploadFileUtil','uploadoss'], function () {
    layui.use(['form', 'upload'], function () {
        let form = layui.form;
        let upload = layui.upload;
        let agent_name = null;

        // 角色数据配置
        const roleData = {
            kindergarten_web: [
                {value: '系统管理员', title: '系统管理员',type: '1'},
                {value: '园长', title: '园长',type: '2'},
                {value: '教师', title: '教师',type: '3'},
                {value: '保健医', title: '保健医',type: '4'},
                {value: '财务', title: '财务',type: '5'},
                {value: '安保', title: '安保',type: '6'}
            ],
            parent_h5: [
                {value: '家长', title: '家长',type: '7'}
            ]
        };

        // 适用端数据配置
        const endData = {
            '全部': '全部',
            '幼儿园管理WEB': '幼儿园管理WEB',
            '家长端H5（后期拓展）': '家长端H5（后期拓展）'
        };

        // 存储选中的值
        let selectedEnds = [];
        let selectedRoles = [];
        let pluginData = []; // 存储插件数据

        // 字符计数功能
        function setupCharCount(selector, maxLength) {
            $(document).on('input', selector, function() {
                const currentLength = $(this).val().length;
                $(this).closest('.layui-form-item').find('.layui-word-auxo').text(currentLength + '/' + maxLength);
            });
        }

        // 设置字符计数
        setupCharCount('input[name="agent_name"]', 30);
        setupCharCount('textarea[name="description"]', 100);
        setupCharCount('textarea[name="function_type"]', 100);

        // Logo类型切换事件，TODO  默认选择第二个  如果用户选择了关联数据插件，那么默认选择第一个，也就是 plugin，否则提交表单部分会出问题
        form.on('radio(logoType)', function(data){
            console.log('logoType:')
            const logoType = data.value;
            const customUploadSection = $('#customUploadSection');
            const pluginDropdownSection = $('#pluginDropdownSection');
            const uploadArea = $('#uploadArea');
            const uploadBtn = $('#uploadBtn');

            if (logoType === 'custom') {
                // 选择自定义上传
                customUploadSection.removeClass('inactive');
                pluginDropdownSection.removeClass('show');
                uploadArea.show();
                uploadBtn.show();

                // 清除插件选择
                $('select[name="plugin_id"]').val('');
                form.render('select');
            } else if (logoType === 'plugin') {
                // 选择数据插件内容
                customUploadSection.addClass('inactive');
                pluginDropdownSection.addClass('show');
                uploadArea.hide();
                uploadBtn.hide();

                // 清除上传的图片
                $('#imagePreview').hide();
                uploadedImageUrl = '';
            }
        });

        // 点击上传区域触发上传
        $(document).on('click', '#uploadArea', function() {
            if ($('input[name="logo_type"][value="custom"]').is(':checked')) {
                $('#uploadBtn').click();
            }
        });

        // 优化后的插件数据加载函数，支持回调
        function loadPluginData(callback) {
            $.sm((re, err) => {
                if (err) {
                    console.error('加载插件数据失败:', err);
                    layer.msg('加载插件数据失败');
                } else {
                    pluginData = re || [];
                    console.log('插件数据加载成功:', pluginData);

                    // 更新下拉选择框选项
                    updatePluginSelect();

                    // 如果有回调函数，执行它
                    if (typeof callback === 'function') {
                        callback();
                    }
                }
            }, ["w_plugin.getIdAndName"]);
        }

        // 更新插件下拉选择框
        function updatePluginSelect() {
            const select = $('select[name="plugin_id"]');

            // 清空现有选项（除了默认选项）
            select.find('option:not(:first)').remove();

            // 添加插件选项
            pluginData.forEach(plugin => {
                select.append(`<option value="${plugin.id}">${plugin.plugin_name}(ID:${plugin.id})</option>`);
            });

            // 重新渲染select
            form.render('select');
        }

        // 完善的logo回显逻辑
        function setLogoDisplay(data) {
            if (!data.logo && !data.plugin_id) {
                // 如果既没有logo也没有plugin_id，默认选择自定义上传
                $('input[name="logo_type"][value="custom"]').prop('checked', true);
                $('#customUploadSection').removeClass('inactive');
                $('#pluginDropdownSection').removeClass('show');
                form.render('radio');
                return;
            }

            // 检查logo是否为纯数字（插件ID）
            const logoValue = data.logo ? data.logo.toString().trim() : '';
            const isPluginId = /^\d+$/.test(logoValue);
            const hasPluginId = data.plugin_id && data.plugin_id.toString().trim() !== '';

            if (isPluginId || hasPluginId || data.logo_type === 'plugin') {
                // 插件类型的logo
                $('input[name="logo_type"][value="plugin"]').prop('checked', true);
                $('#pluginDropdownSection').addClass('show');
                $('#customUploadSection').addClass('inactive');
                $('#uploadArea').hide();
                $('#uploadBtn').hide();

                // 确定要设置的插件ID
                let targetPluginId;
                if (hasPluginId) {
                    targetPluginId = data.plugin_id.toString();
                } else if (isPluginId) {
                    targetPluginId = logoValue;
                }

                // 设置插件下拉框值
                if (targetPluginId) {
                    const pluginSelect = $('select[name="plugin_id"]');
                    pluginSelect.val(targetPluginId);
                    form.render('select');

                    // 验证是否设置成功
                    setTimeout(() => {
                        if (pluginSelect.val() !== targetPluginId) {
                            console.warn('插件ID设置失败，可能插件不存在:', targetPluginId);
                            layer.msg('插件不存在，请重新选择', {icon: 2});
                        }
                    }, 100);
                }

            } else if (logoValue && logoValue !== '') {
                // 自定义图片URL
                $('input[name="logo_type"][value="custom"]').prop('checked', true);
                $('#customUploadSection').removeClass('inactive');
                $('#pluginDropdownSection').removeClass('show');
                $('#uploadArea').hide();
                $('#uploadBtn').show();

                uploadedImageUrl = logoValue;
                $('#imagePreview').attr('src', logoValue).show();

                // 验证图片是否能正常加载
                const img = new Image();
                img.onload = function() {
                    console.log('图片加载成功:', logoValue);
                };
                img.onerror = function() {
                    console.warn('图片加载失败:', logoValue);
                    layer.msg('图片加载失败，请重新上传', {icon: 2});
                };
                img.src = logoValue;
            }

            // 重新渲染表单
            form.render('radio');
        }

        // 自定义下拉框功能
        window.toggleDropdown = function(selectId) {
            const dropdown = $('#' + selectId + ' .select-dropdown');
            const selectInput = $('#' + selectId + ' .select-input');

            // 切换下拉框显示状态
            dropdown.toggleClass('show');
            selectInput.toggleClass('active');

            // 点击其他地方关闭下拉框
            if (dropdown.hasClass('show')) {
                $(document).on('click.dropdown', function(e) {
                    if (!$(e.target).closest('#' + selectId).length) {
                        dropdown.removeClass('show');
                        selectInput.removeClass('active');
                        $(document).off('click.dropdown');
                    }
                });
            }
        };

        // 更新标签显示
        function updateTags(selectId, selectedValues, dataMap) {
            const tagsContainer = $('#' + selectId + ' .selected-tags');
            const placeholder = $('#' + selectId + ' .placeholder');

            tagsContainer.empty();

            if (selectedValues.length > 0) {
                placeholder.hide();
                selectedValues.forEach(value => {
                    const label = dataMap[value] || value;
                    const tag = $(`
                        <div class="tag-item">
                            ${label}
                            <span class="remove-tag" onclick="removeTag('${selectId}', '${value}')">&times;</span>
                        </div>
                    `);
                    tagsContainer.append(tag);
                });
            } else {
                placeholder.show();
            }
        }

        // 移除标签
        window.removeTag = function(selectId, value) {
            if (selectId === 'applicableEndSelect') {
                selectedEnds = selectedEnds.filter(v => v !== value);
                updateTags('applicableEndSelect', selectedEnds, endData);
                updateRoleOptions();
                $('#hiddenApplicableEnd').val(selectedEnds.join(','));
            } else if (selectId === 'applicableRoleSelect') {
                selectedRoles = selectedRoles.filter(v => v !== value);
                updateTags('applicableRoleSelect', selectedRoles, getRoleDataMap());
                $('#hiddenApplicableRole').val(selectedRoles.join(','));
            }
        };

        // 获取角色数据映射
        function getRoleDataMap() {
            let roleMap = {};
            if (selectedEnds.includes('全部')) {
                roleMap['全部'] = '全部';
            } else {
                selectedEnds.forEach(end => {
                    // 根据适用端的中文名称来匹配角色数据
                    let endKey = '';
                    if (end === '幼儿园管理WEB') {
                        endKey = 'kindergarten_web';
                    } else if (end === '家长端H5（后期拓展）') {
                        endKey = 'parent_h5';
                    }

                    if (endKey && roleData[endKey]) {
                        roleData[endKey].forEach(role => {
                            roleMap[role.value] = role.title;
                        });
                    }
                });
            }
            return roleMap;
        }

        // 更新角色选项
        function updateRoleOptions() {
            const roleDropdown = $('#roleDropdown');
            roleDropdown.empty();

            // 清空已选择的角色（因为适用端改变了）
            selectedRoles = [];
            updateTags('applicableRoleSelect', selectedRoles, {});
            $('#hiddenApplicableRole').val('');

            if (selectedEnds.includes('全部')) {
                // 如果选择了全部，显示全部选项
                roleDropdown.append('<div class="option-item" data-value="全部">全部</div>');
                $('#rolePlaceholder').text('请选择适用角色');
            } else if (selectedEnds.length === 0) {
                // 如果没有选择适用端，显示提示
                $('#rolePlaceholder').text('请先选择适用端');
            } else {
                let allRoles = [];

                // 根据选择的适用端收集角色
                selectedEnds.forEach(end => {
                    let endKey = '';
                    if (end === '幼儿园管理WEB') {
                        endKey = 'kindergarten_web';
                    } else if (end === '家长端H5（后期拓展）') {
                        endKey = 'parent_h5';
                    }

                    if (endKey && roleData[endKey]) {
                        allRoles = allRoles.concat(roleData[endKey]);
                    }
                });

                // 去重并渲染
                const uniqueRoles = allRoles.filter((role, index, self) =>
                    index === self.findIndex(r => r.value === role.value)
                );

                uniqueRoles.forEach(role => {
                    roleDropdown.append(`<div class="option-item" data-value="${role.value}">${role.title}</div>`);
                });

                $('#rolePlaceholder').text('请选择适用角色');
            }
        }

        // 初始化下拉框事件
        function initDropdownEvents() {
            // 适用端选项点击事件
            $(document).on('click', '#endDropdown .option-item', function() {
                const value = $(this).data('value');

                if (value === '全部') {
                    // 如果点击全部，清空其他选择
                    selectedEnds = ['全部'];
                } else {
                    // 移除全部选项（如果存在）
                    selectedEnds = selectedEnds.filter(v => v !== '全部');

                    // 切换选择状态
                    if (selectedEnds.includes(value)) {
                        selectedEnds = selectedEnds.filter(v => v !== value);
                    } else {
                        selectedEnds.push(value);
                    }
                }

                updateTags('applicableEndSelect', selectedEnds, endData);
                updateRoleOptions();
                $('#hiddenApplicableEnd').val(selectedEnds.join(','));
            });

            // 适用角色选项点击事件
            $(document).on('click', '#roleDropdown .option-item', function() {
                const value = $(this).data('value');

                if (value === '全部') {
                    // 如果点击全部，清空其他选择
                    selectedRoles = ['全部'];
                } else {
                    // 移除全部选项（如果存在）
                    selectedRoles = selectedRoles.filter(v => v !== '全部');

                    // 切换选择状态
                    if (selectedRoles.includes(value)) {
                        selectedRoles = selectedRoles.filter(v => v !== value);
                    } else {
                        selectedRoles.push(value);
                    }
                }

                updateTags('applicableRoleSelect', selectedRoles, getRoleDataMap());
                $('#hiddenApplicableRole').val(selectedRoles.join(','));
            });
        }

        // 图片上传功能
        let uploadedImageUrl = ''; // 存储上传后的图片地址

        upload.render({
            elem: '#uploadBtn',
            type: 'choose',
            accept: 'images',
            acceptMime: 'image/png,image/jpg,image/jpeg',
            auto: false,
            size: 1024, // 1MB
            number: 1,  // 只允许选择一个图片
            choose: function(obj) {
                // 仅处理本地预览
                // obj.preview(function(index, file, result) {
                //     $('#imagePreview').attr('src', result).show();
                //     $('#uploadArea').hide();
                //
                //
                // });

                // 延迟执行上传，给用户确认时间
                // setTimeout(function() {
                    obj.preview(function(index, file,result) {
                        // debugger
                        var options = {
                            region: 'oss-cn-beijing',
                            bucket: bucketName,
                            path: uploadPrefix + '/agent',
                        };

                        // 显示上传中状态
                        layer.msg('正在上传...', {icon: 16, time: 0});
                        var fileBase64 = base64toFile(result)

                        // TODO 提交都是报未找到上传数据
                        uploadFileUtil(options, fileBase64, options.path, null,function(uploadRes) {
                            layer.closeAll('msg'); // 关闭上传中提示
                            console.log('上传结果：', uploadRes);

                            if (uploadRes && uploadRes.key) {
                                var ossUrl = ossPrefix + uploadRes.key + '?x-oss-process=image/resize,m_fill,h_153,w_153';
                                $('#imagePreview').attr('src', ossUrl);
                                uploadedImageUrl = ossUrl;
                                layer.msg('图片上传成功');
                            } else {
                                layer.msg('上传失败，请重试');
                                $('#uploadArea').show();
                                $('#imagePreview').hide();
                            }
                        });
                    });
                // }, 3000);
            },

            // 但保留作为备用处理
            done: function(res) {
                console.log('done 回调触发：', res);
                if (res.code > 0) {
                    return layer.msg('上传失败');
                }
                layer.msg('图片上传成功');
            },

            error: function() {
                layer.msg('上传失败，请重试');
                $('#uploadArea').show();
                $('#imagePreview').hide();
                uploadedImageUrl = null; // 清空已保存的图片地址
            }
        });

        // 表单验证
        form.verify({
            agent_name: function(value) {
                if (!value || value.trim() === "") {
                    return '请输入智能体名称';
                }
                agent_name = value;
            },
            applicable_end: function(value, item) {
                if (selectedEnds.length === 0) {
                    return '请选择适用端';
                }
            },
            applicable_role: function(value, item) {
                if (selectedRoles.length === 0) {
                    return '请选择适用角色';
                }
            }
        });

        // 如果是更新操作，加载现有数据
        if (Arg("type") === "update" && Arg("id") !== "") {
            $.sm((re, err) => {
                if (err) {
                    layer.msg(err);
                } else {
                    console.log(re);
                    let data = re[0];

                    // 设置基本字段
                    form.val('formOk', {
                        "agent_name": data.agent_name,
                        "description": data.description,
                        "function_type": data.function_type,
                        "display_sort": data.display_sort,  // 显示排序
                        "status": data.status.toString()
                    });

                    // 设置适用端 - 修复：从逗号分割的字符串解析
                    if (data.applicable_end) {
                        const applicableEndsStr = typeof data.applicable_end === 'string'
                            ? data.applicable_end
                            : data.applicable_end.toString();

                        // 从逗号分割的字符串中解析
                        selectedEnds = applicableEndsStr.split(',').filter(item => item.trim() !== '');
                        updateTags('applicableEndSelect', selectedEnds, endData);
                        $('#hiddenApplicableEnd').val(selectedEnds.join(','));

                        // 更新角色选项
                        updateRoleOptions();

                        // 设置适用角色 - 修复：从逗号分割的字符串解析
                        setTimeout(() => {
                            if (data.applicable_role) {
                                const applicableRolesStr = typeof data.applicable_role === 'string'
                                    ? data.applicable_role
                                    : data.applicable_role.toString();

                                // 从逗号分割的字符串中解析
                                selectedRoles = applicableRolesStr.split(',').filter(item => item.trim() !== '');
                                updateTags('applicableRoleSelect', selectedRoles, getRoleDataMap());
                                $('#hiddenApplicableRole').val(selectedRoles.join(','));
                            }

                            // 设置时间维度 - 修复：直接使用字符串值
                            if (data.time_granularity) {
                                const timeValue = data.time_granularity.toString().trim();
                                $('input[name="time_granularity"][value="' + timeValue + '"]').prop('checked', true);
                            }

                            form.render();
                        }, 100);
                    }

                    // 在插件数据加载完成后设置logo显示
                    loadPluginData(() => {
                        setLogoDisplay(data);
                    });
                }
            }, ["w_agent.selectById", $.msgwhere({id: [Arg("id")]})]);
        } else {
            // 新增操作时也需要加载插件数据
            loadPluginData();
        }

        // 初始化下拉框事件
        initDropdownEvents();

        form.render();

        // 提交表单
        $("#saveOK").click(function (event, callback) {
            // 手动验证多选必填项
            if (selectedEnds.length === 0) {
                layer.msg('请选择适用端');
                return false;
            }

            if (selectedRoles.length === 0) {
                layer.msg('请选择适用角色');
                return false;
            }

            // 验证Logo设置
            const logoType = $('input[name="logo_type"]:checked').val();
            if (logoType === 'custom' && !uploadedImageUrl) {
                layer.msg('请上传自定义Logo图片');
                return false;
            }

            if (logoType === 'plugin' && !$('select[name="plugin_id"]').val()) {
                layer.msg('请选择数据插件');
                return false;
            }

            form.submit('formOk', function (data) {
                // 收集时间维度数据（单选）
                const selectedTimeGranularity = $('input[name="time_granularity"]:checked').val() || '';
                const logoType = $('input[name="logo_type"]:checked').val();

                // 构建提交数据 - 统一使用逗号分割的字符串格式
                const submitData = {
                    agent_name: data.field.agent_name,
                    description: data.field.description,
                    function_type: data.field.function_type,
                    applicable_end: selectedEnds.join(','),
                    applicable_role: selectedRoles.join(','),
                    display_format: data.field.display_format,
                    time_granularity: selectedTimeGranularity,
                    display_sort: data.field.display_sort,
                    status: data.field.status
                };

                // 根据Logo类型添加相应字段
                if (logoType === 'custom') {
                    submitData.logo = uploadedImageUrl;
                } else if (logoType === 'plugin') {
                    // 将logo 设置为插件id
                    submitData.logo = $('select[name="plugin_id"]').val();
                    // submitData.logo_type = 'plugin'; // 标记logo类型,看后续是否要设置一个logo_type字段
                    submitData.plugin_id = $('select[name="plugin_id"]').val(); // 同时保存plugin_id字段
                }

                if (Arg("type") === "add") {
                    addFn(submitData);
                } else if (Arg("type") === "update") {
                    updateFn(submitData);
                }
                return false;
            });
        });

        // 初始化时渲染角色选项（默认为空）
        updateRoleOptions();
    });

    function addFn(data, callback) {
        $.sm((re, err) => {
            if (err) {
                layer.msg(err);
            } else {
                layer.msg("添加智能体成功！");
                // 如果父页面传递了回调函数，执行它
                if (typeof callback === 'function') {
                    callback();
                }
            }
        }, ["w_agent.add", JSON.stringify(data)]);
    }

    function updateFn(data, callback) {
        $.sm((re, err) => {
            if (err) {
                layer.msg(err);
            } else {
                layer.msg("修改智能体成功");
                // 如果父页面传递了回调函数，执行它
                if (typeof callback === 'function') {
                    callback();
                }
            }
        }, ["w_agent.update", JSON.stringify(data), $.msgwhere({id: [Arg("id")]})]);
    }
});
```



### 2



















