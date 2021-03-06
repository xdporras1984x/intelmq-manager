var defaults = {};
var nodes = {};
var edges = {};
var bots = {};

var network = null;
var network_container = null;
var popup = null;
var span = null;
var table = null;
var modal = null;
var disabledKeys = ['group', 'name', 'module'];

var bot_before_altering = null;
var EDIT_DEFAULT_BUTTON_ID = 'editDefaults';
var BORDER_TYPE_CLASSES = {
    'DEFAULT': 'info',
    'GENERIC': 'success',
    'RUNTIME': 'warning',
}
var BORDER_TYPES = {
    'DEFAULT': 'default',
    'GENERIC': 'generic',
    'RUNTIME': 'runtime',
    'OTHERS': 'default',
}

var draggedElement = null;
var options = null;
var positions = null;
var isTooltipEnabled = true;

$(window).on('hashchange', function () {
    location.reload();
});

$(window).on('unload', function () {
    return "If you have not saved your work you'll loose the changes you have made. Do you want to continue?";
});

function resize() {
    // Resize body
    var network_container = document.getElementById('network-container');
    network_container.style.height = (window.innerHeight - network_container.offsetTop) + "px";
    network_container.style.overflowX = "auto";
    network_container.style.overflowY = "auto";

    if (network != null && network != undefined) {
        network.redraw();
    }

    load_html_elements();
}

function load_html_elements() {
    // Load popup, span and table
    network_container = document.getElementById('network-container');
    network_container.setAttribute('ondrop', 'handleDrop(event)');
    network_container.setAttribute('ondragover', 'allowDrop(event)');
    popup = document.getElementById("network-popUp");
    span = document.getElementById('network-popUp-title');
    table = document.getElementById("network-popUp-fields");
    modal = document.getElementById('addNewKeyModal');
}

function load_file(url, callback) {
    $.getJSON(url)
        .done(function (json) {
            callback(json);
        })
        .fail(function (jqxhr, textStatus, error) {
            var err = textStatus + ", " + error;
            show_error('Failed to obtain JSON: ' + url + ' with error: ' + err);
            callback({});
        });
}

function load_bots(config) {
    var available_bots = document.getElementById("side-menu")
    //available_bots.innerHTML = '';

    for (bot_group in config) {
        var group = config[bot_group];

        group_title = document.createElement('a');
        group_title.innerHTML = bot_group + '<span class="fa arrow"></span>';

        var new_element = group_title.cloneNode(true);

        bots_submenu = document.createElement('ul');
        bots_submenu.setAttribute('class', 'nav nav-second-level collapse');

        group_menu = document.createElement('li');
        group_menu.appendChild(new_element);
        group_menu.appendChild(bots_submenu);
        group_menu.style.borderBottomColor = GROUP_COLORS[bot_group];

        available_bots.appendChild(group_menu);

        for (bot_name in group) {
            var bot = group[bot_name];

            var bot_title = document.createElement('a');
            bot_title.setAttribute('data-toggle', 'tooltip');
            bot_title.setAttribute('data-placement', 'right');
            bot_title.setAttribute('title', bot['description']);
            bot_title.setAttribute('onclick', 'fill_bot(undefined, "' + bot_group + '", "' + bot_name + '")');
            bot_title.innerHTML = bot_name;

            var bot_submenu = document.createElement('li');
            bot_submenu.appendChild(bot_title);
            bot_submenu.setAttribute('draggable', 'true');
            bot_submenu.addEventListener('dragstart', handleDragStart, false);
            bot_submenu.id = bot_name + '@' + bot_group;

            bots_submenu.appendChild(bot_submenu);

            if (bots[bot_group] === undefined) {
                bots[bot_group] = {};
            }

            bots[bot_group][bot_name] = {
                'name': bot_name,
                'group': bot_group,
                'module': bot['module'],
                'description': bot['description'],
                'enabled': true,
                'parameters': bot['parameters'],
            }

            for (parameter in bot['parameters']) {
                var value = bot['parameters'][parameter];
                bots[bot_group][bot_name]['parameters'][parameter] = value;
            }
        }
    }

    $('#side-menu').metisMenu({ 'restart': true });

    btnEditDefault = document.createElement('button');
    btnEditDefault.setAttribute('class', 'btn btn-warning');
    btnEditDefault.innerHTML = 'Edit Defaults';
    btnEditDefault.style.textAlign = 'center';
    btnEditDefault.id = EDIT_DEFAULT_BUTTON_ID;
    btnEditDefault.onclick = function () {
        create_form('Edit Defaults', EDIT_DEFAULT_BUTTON_ID, undefined);
        fill_editDefault(defaults);
    };
    buttonContainer = document.createElement('li');
    buttonContainer.appendChild(btnEditDefault);
    buttonContainer.setAttribute('id', 'customListItem');

    available_bots.appendChild(buttonContainer);

    if (window.location.hash != '#new') {
        load_file(DEFAULTS_FILE, load_defaults);
    } else {
        draw();
        resize();
        enableSaveButtonBlinking();
    }
}

function fill_editDefault(data) {
    table.innerHTML = '';

    for (key in data) {
        insertKeyValue(key, data[key], 'defaultConfig', false);
    }
    // to enable scroll bar
    popup.setAttribute('class', "with-bot");
}

function handleDragStart(event) {
    network.addNodeMode();
    var elementID = event.currentTarget.id.split('@');

    draggedElement = {
        bot_name: elementID[0],
        bot_group: elementID[1]
    };

    // necessary for firefox
    event.dataTransfer.setData('text/plain', null);
}

function handleDrop(event) {

    // --- necessary for firefox
    if (event.preventDefault) {
        event.preventDefault();
    }
    if (event.stopPropagation) {
        event.stopPropagation();
    }
    // ---

    var domPointer = network.interactionHandler.getPointer({ x: event.clientX, y: event.clientY });
    var canvasPointer = network.manipulation.canvas.DOMtoCanvas(domPointer);

    var clickData = {
        pointer: {
            canvas: {
                x: canvasPointer.x,
                y: canvasPointer.y
            }
        }
    };

    network.manipulation.temporaryEventFunctions[0].boundFunction(clickData);

    fill_bot(undefined, draggedElement.bot_group, draggedElement.bot_name);
}

function allowDrop(event) {
    event.preventDefault();
}

function load_defaults(config) {
    defaults = read_defaults_conf(config);

    load_file(RUNTIME_FILE, load_runtime);
}

function load_runtime(config) {
    nodes = read_runtime_conf(config);

    load_file(PIPELINE_FILE, load_pipeline);
}

function load_pipeline(config) {
    edges = read_pipeline_conf(config, nodes);
    nodes = add_defaults_to_nodes(nodes, defaults);

    load_file(POSITIONS_FILE, load_positions);
}

function load_positions(config) {
    positions = read_positions_conf(config);

    draw();
    resize();
}

function save_data_on_files() {
    if (!confirm("By clicking 'OK' you are replacing the configuration in your files by the one represented by the network on this page. Do you agree?")) {
        return;
    }

    nodes = remove_defaults(nodes);

    var alert_error = function (file, jqxhr, textStatus, error) {
        show_error('There was an error saving ' + file + ':\nStatus: ' + textStatus + '\nError: ' + error);
    }

    $.post('./php/save.php?file=runtime', generate_runtime_conf(nodes))
        .done(function (data) {
            saveSucceeded(data);
        })
        .fail(function (jqxhr, textStatus, error) {
            alert_error('runtime', jqxhr, textStatus, error);
        });

    $.post('./php/save.php?file=pipeline', generate_pipeline_conf(edges))
        .done(function (data) {
            saveSucceeded(data);
        })
        .fail(function (jqxhr, textStatus, error) {
            alert_error('pipeline', jqxhr, textStatus, error);
        });

    $.post('./php/save.php?file=positions', generate_positions_conf())
        .done(function (data) {
            saveSucceeded(data);
        })
        .fail(function (jqxhr, textStatus, error) {
            alert_error('positions', jqxhr, textStatus, error);
        });

    $.post('./php/save.php?file=defaults', generate_defaults_conf(defaults))
        .done(function (data) {
            saveSucceeded(data);
        })
        .fail(function (jqxhr, textStatus, error) {
            alert_error('defaults', jqxhr, textStatus, error);
        });

    nodes = add_defaults_to_nodes(nodes, defaults);
    disableSaveButtonBlinking();
}

function saveSucceeded(response) {
    if (response === 'success') {
        return true;
    } else {
        alert(response);
        return false;
    }
}

function convert_edges(edges) {
    var new_edges = [];

    for (index in edges) {
        var new_edge = {};
        new_edge.id = edges[index]['id'];
        new_edge.from = edges[index]['from'];
        new_edge.to = edges[index]['to'];

        new_edges.push(new_edge);
    }

    return new_edges;
}

function convert_nodes(nodes, includePositions) {
    var new_nodes = [];

    for (index in nodes) {
        var new_node = {};
        new_node.id = nodes[index]['id'];
        new_node.label = nodes[index]['id'];
        new_node.group = nodes[index]['group'];
        new_node.title = JSON.stringify(nodes[index], undefined, 2).replace(/\n/g, '\n<br>').replace(/ /g, "&nbsp;");

        if (includePositions === true) {
            try {
                new_node.x = positions[index].x;
                new_node.y = positions[index].y;
            } catch (err) {
                console.error('positions in file are ignored:', err);
                show_error('Saved positions are not valid or not complete. The configuration has possibly been modified outside of the IntelMQ-Manager.');
                includePositions = false;
            }
        }

        new_nodes.push(new_node);
    }

    return new_nodes;
}

function fill_bot(id, group, name) {
    var bot = {};
    table.innerHTML = '';

    if (id === undefined) {
        bot = bots[group][name];

        name = bot['name'].replace(/\ /g, '-').replace(/[^A-Za-z0-9-]/g, '');
        group = bot['group'].replace(/\ /g, '-');
        default_id = name + "-" + group;
        bot['id'] = default_id;
        bot['defaults'] = {};

        for (key in defaults) {
            if (key in bot.parameters) {
                continue;
            } else {
                bot['defaults'][key] = defaults[key];
            }
        }
    }
    else {
        bot = nodes[id];
    }

    bot_before_altering = bot;

    insertKeyValue('id', bot['id'], 'id', false);
    insertBorder(BORDER_TYPES.GENERIC);
    for (key in bot) {
        if (STARTUP_KEYS.includes(key)) {
            insertKeyValue(key, bot[key], BORDER_TYPES.GENERIC, false);
        }
    }
    insertBorder(BORDER_TYPES.RUNTIME);
    for (key in bot.parameters) {
        insertKeyValue(key, bot.parameters[key], BORDER_TYPES.RUNTIME, true);
    }
    insertBorder(BORDER_TYPES.DEFAULT);
    for (key in bot.defaults) {
        insertKeyValue(key, bot.defaults[key], BORDER_TYPES.DEFAULT, false);
    }

    popup.setAttribute('class', "with-bot");
}

function insertBorder(border_type) {
    var new_row = table.insertRow(-1);
    var sectionCell1 = new_row.insertCell(0);
    var sectionCell2 = new_row.insertCell(1);
    var addButtonCell = new_row.insertCell(2);

    sectionCell1.setAttribute('id', 'border');
    sectionCell2.setAttribute('id', 'border');
    sectionCell1.innerHTML = border_type;
    sectionCell2.innerHTML = border_type;

    switch (border_type) {
        case BORDER_TYPES.GENERIC:
            new_row.setAttribute('class', BORDER_TYPE_CLASSES.GENERIC);
            break;
        case BORDER_TYPES.RUNTIME:
            new_row.setAttribute('class', BORDER_TYPE_CLASSES.RUNTIME);
            var addButton = document.createElement('button');
            var addButtonSpan = document.createElement('span');
            addButtonSpan.setAttribute('class', 'glyphicon glyphicon-plus-sign');
            addButton.setAttribute('class', 'btn btn-warning');
            addButton.setAttribute('title', 'add new key');
            addButton.setAttribute('onclick', 'showModal()');
            addButton.appendChild(addButtonSpan);
            addButtonCell.appendChild(addButton);
            new_row.setAttribute('id', border_type);
            break;
        case BORDER_TYPES.DEFAULT:
            new_row.setAttribute('class', BORDER_TYPE_CLASSES.DEFAULT);
            break;
        default:
            new_row.setAttribute('class', BORDER_TYPE_CLASSES.OTHERS);
    }
}

function insertKeyValue(key, value, section, allowXButtons, insertAt) {

    var new_row = null;

    if (insertAt === undefined) {
        new_row = table.insertRow(-1);
    } else {
        new_row = table.insertRow(insertAt);
    }

    var keyCell = new_row.insertCell(0);
    var valueCell = new_row.insertCell(1);
    var xButtonCell = new_row.insertCell(2);
    var valueInput = document.createElement("input");

    keyCell.setAttribute('class', 'node-key');
    keyCell.setAttribute('id', section)
    valueCell.setAttribute('class', 'node-value');
    valueInput.setAttribute('type', 'text');
    valueInput.setAttribute('id', key);

    if (disabledKeys.includes(key) === true) {
        valueInput.setAttribute('disabled', "true");
    }

    if (allowXButtons === true) {
        var xButton = document.createElement('button');
        var xButtonSpan = document.createElement('span');
        if (key in defaults) {
            xButtonSpan.setAttribute('class', 'glyphicon glyphicon-refresh');
            xButton.setAttribute('class', 'btn btn-default');
            xButton.setAttribute('title', 'reset to default');
            xButton.setAttribute('onclick', 'resetToDefault(\'' + key + '\')');
        } else {
            xButtonSpan.setAttribute('class', 'glyphicon glyphicon-remove-circle');
            xButton.setAttribute('class', 'btn btn-danger');
            xButton.setAttribute('title', 'delete parameter');
            xButton.setAttribute('onclick', 'deleteParameter(\'' + key + '\')');
        }

        xButton.appendChild(xButtonSpan);
        xButtonCell.appendChild(xButton);
    }

    valueCell.appendChild(valueInput);

    keyCell.innerHTML = key;
    valueInput.setAttribute('value', value);
}

function resetToDefault(input_id) {
    $('#' + input_id)[0].value = defaults[input_id];
}

function deleteParameter(input_id) {
    var current_index = $('#' + input_id).closest('tr').index();
    table.deleteRow(current_index);
}

function addNewKey() {
    var current_index = $('#' + BORDER_TYPES.RUNTIME).index();
    var newKeyInput = document.getElementById('newKeyInput');
    var newValueInput = document.getElementById('newValueInput');

    if (!BOT_ID_REGEX.test(newKeyInput.value)) {
        show_error("Bot ID's can only be composed of numbers, letters and hiphens");
        $('#newKeyInput').focus();
    } else {
        hideModal();
        insertKeyValue(newKeyInput.value, newValueInput.value, BORDER_TYPES.RUNTIME, true, current_index + 1);
        newKeyInput.value = '';
        newValueInput.value = '';
    }
}

function showModal() {
    modal.style.display = "block";
    $('#newKeyInput').focus();
}

function hideModal() {
    modal.style.display = "none";
}

window.onclick = function (event) {
    if (event.target == modal) {
        modal.style.display = "none";
    }
}

$(document).keydown(function(event) {
    if (event.keyCode == 27) {
        if ($('#addNewKeyModal').is(':visible')) {
            hideModal();
        } else if ($('#network-popUp').is(':visible')) {
            $('#network-popUp-cancel').click();
        }
    }
});

$('#newKeyInput').keyup(function (event) {
    // 'enter' key
    if (event.keyCode == 13){
        $('#addNewKeyModal-ok').click();
    }
});

$('#newValueInput').keyup(function (event) {
    // 'enter' key
    if (event.keyCode == 13){
        $('#addNewKeyModal-ok').click();
    }
});

function saveDefaults_tmp(data, callback) {
    defaults = {};
    saveFormData();
    enableSaveButtonBlinking();
    clearPopUp(data, callback);
}

function saveFormData() {
    for (var i = 0; i < table.rows.length; i++) {
        var keyCell = table.rows[i].cells[0];
        var valueCell = table.rows[i].cells[1];
        var valueInput = valueCell.getElementsByTagName('input')[0];

        if (valueInput === undefined) continue;

        var key = keyCell.innerText;
        var value = null;

        try {
            value = JSON.parse(valueInput.value);
        } catch (err) {
            value = valueInput.value;
        }

        switch (keyCell.id) {
            case 'id':
                node[key] = value;
                break;
            case 'generic':
                node[key] = value;
                break;
            case 'runtime':
                node['parameters'][key] = value;
                break;
            case 'border':
                break;
            case 'defaultConfig':
                defaults[key] = value;
                break;
            default:
                node['defaults'][key] = value;
        }
    }
}

function saveData(data, callback) {
    node = {};
    node['parameters'] = {};
    node['defaults'] = {};

    saveFormData();

    // check inputs beeing valid
    if (node.id == '' && node.group == '') {
        show_error('fields id and group must not be empty!');
        return;
    }

    if (node.id != bot_before_altering.id) {
        if (!confirm("When you edit an ID what you are doing in fact is to create a clone of the current bot. You will have to delete the old one manually. Proceed with the operation?")) {
            return;
        }
    }

    if (!BOT_ID_REGEX.test(node.id)) {
        show_error("Bot ID's can only be composed of numbers, letters and hiphens");
        return;
    }


    // switch paremters and defaults
    for (key in node) {
        if (key === 'parameters') {
            for (parameterKey in node.parameters) {
                if (node.parameters[parameterKey] !== bot_before_altering.parameters[parameterKey]) {
                    if (parameterKey in defaults) {
                        if (node.parameters[parameterKey] === defaults[parameterKey]) {
                            swapToDefaults(node, parameterKey);
                        }
                    }
                }
            }
        } else if (key === 'defaults') {
            for (defaultsKey in node.defaults) {
                if (node.defaults[defaultsKey] !== defaults[defaultsKey]) {
                    swapToParameters(node, defaultsKey);
                }
            }
        }
    }

    data.id = node.id;
    data.label = node.id
    data.group = node.group;
    data.level = GROUP_LEVELS[data.group];
    data.title = JSON.stringify(node, undefined, 2).replace(/\n/g, '\n<br>').replace(/ /g, "&nbsp;");

    nodes[node.id] = node;

    enableSaveButtonBlinking();
    clearPopUp(data, callback);
}

function swapToParameters(node, key) {
    node.parameters[key] = node.defaults[key];
    delete node.defaults[key];
}

function swapToDefaults(node, key) {
    node.defaults[key] = node.parameters[key];
    delete node.parameters[key];
}

function create_form(title, data, callback) {
    span.innerHTML = title;

    var okButton = document.getElementById('network-popUp-ok');
    var cancelButton = document.getElementById('network-popUp-cancel');

    if (data === EDIT_DEFAULT_BUTTON_ID) {
        okButton.onclick = saveDefaults_tmp.bind(this, data, callback);
    } else {
        okButton.onclick = saveData.bind(this, data, callback);
    }

    cancelButton.onclick = clearPopUp.bind(this, data, callback);

    table.innerHTML = "<p>Please select one of the bots on the left</p>";
    popup.style.display = 'block';
    popup.setAttribute('class', "without-bot");
}

function clearPopUp(data, callback) {
    var okButton = document.getElementById('network-popUp-ok');
    var cancelButton = document.getElementById('network-popUp-cancel');
    okButton.onclick = null;
    cancelButton.onclick = null;

    popup.style.display = 'none';
    span.innerHTML = "";

    for (i = table.rows.length - 1; i >= 0; i--) {
        var position = table.rows[i].rowIndex;

        if (position >= CORE_FIELDS) {
            table.deleteRow(position);
        } else {
            table.rows[i].setAttribute('value', '');
        }
    }

    popup.setAttribute('class', "without-bot");
    if ((callback !== undefined) && (data['label'] != 'new')) {
        callback(data);
    }
}

function enableSaveButtonBlinking() {
    document.getElementById('vis-save').setAttribute('class', 'vis-save-blinking');
}

function disableSaveButtonBlinking() {
    document.getElementById('vis-save').setAttribute('class', 'vis-save');
}

function redrawNetwork() {
    options.layout.randomSeed = Math.round(Math.random() * 1000000);

    var data = {
        nodes: convert_nodes(nodes, false),
        edges: convert_edges(edges)
    };

    network.destroy();
    network = null;
    network = new vis.Network(network_container, data, options);
    enableSaveButtonBlinking();
}

function draw() {
    load_html_elements();

    var data = {};

    if (window.location.hash == '#load') {
        data = {
            nodes: convert_nodes(nodes, true),
            edges: convert_edges(edges)
        };
    }

    options = {
        physics: {
            hierarchicalRepulsion: {
                nodeDistance: 200,
                springLength: 200
            },
            stabilization: {
                enabled: true,
                fit: true
            },
            solver: 'hierarchicalRepulsion'
        },
        interaction: {
            tooltipDelay: 1000,
            navigationButtons: true
        },
        nodes: {
            font: {
                size: 14, // px
                face: 'arial',
                align: 'center'
            }
        },
        edges: {
            length: 200,
            arrows: {
                to: { enabled: true, scaleFactor: 1, type: 'arrow' }
            },
            physics: true,
            font: {
                size: 14, // px
                face: 'arial',
            },
            color: {
                inherit: false
            },
            smooth: {
                enabled: true,
                type: 'continuous'
            }
        },
        groups: {
            Collector: {
                shape: 'box',
                color: GROUP_COLORS['Collector'],
            },
            Parser: {
                shape: 'box',
                color: GROUP_COLORS['Parser']
            },
            Expert: {
                shape: 'box',
                color: GROUP_COLORS['Expert'],
                fontColor: "#FFFFFF"
            },
            Output: {
                shape: 'box',
                color: GROUP_COLORS['Output']
            }
        },

        manipulation: {
            enabled: true,
            initiallyActive: true,
            addNode: true,
            addEdge: true,
            editNode: true,
            editEdge: false,
            deleteNode: true,
            deleteEdge: true,

            addNode: function (data, callback) {
                create_form("Add Node", data, callback);
            },
            editNode: function (data, callback) {
                create_form("Edit Node", data, callback);
                fill_bot(data.id, undefined, undefined);
            },
            deleteNode: function (data, callback) {
                callback(data);

                for (index in data.edges) {
                    delete edges[data.edges[index]];
                }

                for (index in data.nodes) {
                    delete nodes[data.nodes[index]];
                }
                enableSaveButtonBlinking();
            },
            addEdge: function (data, callback) {
                if (data.from == data.to) {
                    show_error('This action would cause an infinite loop');
                    return;
                }

                for (index in edges) {
                    if (edges[index].from == data.from && edges[index].to == data.to) {
                        show_error('There is already a link between those bots');
                        return;
                    }
                }

                var neighbors = ACCEPTED_NEIGHBORS[nodes[data.from].group];
                var available_neighbor = false;
                for (index in neighbors) {
                    if (nodes[data.to].group == neighbors[index]) {
                        callback(data);
                        available_neighbor = true;
                    }
                }

                if (!available_neighbor) {
                    if (neighbors.length == 0) {
                        show_error("Node type " + nodes[data.from].group + " can't connect to other nodes");
                    } else {
                        show_error('Node type ' + nodes[data.from].group + ' can only connect to nodes of types: ' + neighbors.join());
                    }
                    return;
                }


                if (edges[data.id] === undefined) {
                    edges[data.id] = {};
                }

                edges[data.id] = { 'from': data.from, 'to': data.to };
                enableSaveButtonBlinking();
            },
            deleteEdge: function (data, callback) {
                delete edges[data["edges"][0]];
                callback(data);
                enableSaveButtonBlinking();
            }
        },
        layout: {
            hierarchical: false,
            randomSeed: undefined
        }
    };

    network = new vis.Network(network_container, data, options);
}

// functions called in vis.js
function disableTooltip() {
    options.interaction.tooltipDelay = 999999;
    network.setOptions(options);
    isTooltipEnabled = false;
}

function enableTooltip() {
    options.interaction.tooltipDelay = 1000;
    isTooltipEnabled = true;
    network.setOptions(options);
}

function disableEditDefaultButton() {
    $('#' + EDIT_DEFAULT_BUTTON_ID).prop('disabled', true);
}

function enableEditDefaultButton() {
    $('#' + EDIT_DEFAULT_BUTTON_ID).prop('disabled', false);
}
// INTELMQ

/*
 * Application entry point
 */

// Dynamically load available bots
load_file(BOTS_FILE, load_bots);

// Dynamically adapt to fit screen
window.onresize = resize;

