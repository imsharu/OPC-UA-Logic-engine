from flask import Flask, render_template, request, jsonify
from opcua import Client
import operator

app = Flask(__name__)

# Logical operations
logical_operations = {
    'AND': lambda a, b: a and b,
    'OR': lambda a, b: a or b,
    'NOT': lambda a: not a,
    'GreaterThan': lambda a, b: a > b,
    'LessThan': lambda a, b: a < b
}

# Mathematical operations
math_operations = {
    'ADD': lambda *args: sum(args),
    'SUBTRACT': lambda *args: args[0] - sum(args[1:]),
    'MULTIPLY': lambda *args: operator.mul(*args),
    'DIVIDE': lambda *args: operator.truediv(*args)
}


def parse_opcua_node(node):
    """
    Recursively parse a node to build a nested dictionary structure:
    {
      "_tags": {tagName: nodeId, ...},
      "_groups": {
         groupName: { "_tags": {...}, "_groups": {...} },
         ...
      }
    }
    """
    result = {"_tags": {}, "_groups": {}}
    children = node.get_children()

    for child in children:
        child_name = child.get_browse_name().Name
        if child_name.startswith("_") or "Server" in child_name:
            # Skip hidden / internal nodes
            continue

        grandchildren = child.get_children()
        # If no grandchildren => it's a tag
        if len(grandchildren) == 0:
            result["_tags"][child_name] = child.nodeid.to_string()
        else:
            # It's a group
            result["_groups"][child_name] = parse_opcua_node(child)

    return result


def fetch_structure(client_url):
    """
    Return a dictionary of channels, each containing nested devices/groups/tags.
    Example:
      {
        "Channel1": {
          "_tags": {...},
          "_groups": {
            "Device1": {
              "_tags": {...},
              "_groups": {
                "Group1": { ... }
              }
            }
          }
        }
      }
    """
    structure = {}
    try:
        client = Client(client_url)
        client.connect()

        objects = client.get_objects_node().get_children()
        for channel in objects:
            channel_name = channel.get_browse_name().Name
            if channel_name.startswith("_") or "Server" in channel_name:
                continue
            structure[channel_name] = parse_opcua_node(channel)

        client.disconnect()
    except Exception as e:
        print(f"Error fetching OPC UA structure: {e}")
    return structure


@app.route('/')
def index():
    return render_template('index_6.html')


@app.route('/api/get-opcua-structure', methods=['GET'])
def get_opcua_structure():
    opcua_structure = fetch_structure("opc.tcp://127.0.0.1:49320")
    return jsonify(opcua_structure)


def fetch_tag_value(client_url, node_id):
    try:
        client = Client(client_url)
        client.connect()
        value = client.get_node(node_id).get_value()
        client.disconnect()
        return value
    except Exception as e:
        print(f"Error fetching tag value: {e}")
        return None


@app.route('/api/get-tag-value', methods=['POST'])
def get_tag_value():
    data = request.json
    value = fetch_tag_value("opc.tcp://127.0.0.1:49320", data.get('node_id'))
    if value is not None:
        return jsonify({"value": value})
    else:
        return jsonify({"error": "Failed to fetch tag value"}), 500


@app.route('/evaluate_logic', methods=['POST'])
def evaluate_logic():
    data = request.json
    operation = data['operation']
    inputs = data['inputs']

    if operation == 'NOT':
        if len(inputs) != 1:
            return jsonify({'error': 'NOT requires 1 input'}), 400
        result = logical_operations[operation](inputs[0])
    else:
        if len(inputs) != 2:
            return jsonify({'error': f'{operation} requires 2 inputs.'}), 400
        result = logical_operations[operation](inputs[0], inputs[1])

    return jsonify({'result': result})


@app.route('/evaluate_math', methods=['POST'])
def evaluate_math():
    data = request.json
    operation = data['operation']
    inputs = data['inputs']

    if len(inputs) != 8:
        return jsonify({'error': f'{operation} requires 8 inputs.'}), 400

    result = math_operations[operation](*inputs)
    return jsonify({'result': result})


@app.route('/favicon.ico')
def favicon():
    return '', 204


if __name__ == '__main__':
    app.run(debug=True)
