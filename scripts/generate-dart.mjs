import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const spec = JSON.parse(readFileSync('packages/contracts/openapi.json', 'utf8'));
const schemas = spec.components.schemas;
const refName = s => s.$ref?.split('/').pop();
function type(s) {
 if (s.allOf?.length === 1) return type(s.allOf[0]);
 const ref = refName(s);
 let result;
 if (ref) result = ref;
 else if (s.type === 'string') result = 'String';
 else if (s.type === 'integer') result = 'int';
 else if (s.type === 'number') result = 'num';
 else if (s.type === 'boolean') result = 'bool';
 else if (s.type === 'array') result = 'List<' + type(s.items) + '>';
 else if (s.type === 'object') result = 'Map<String, dynamic>';
 else throw new Error('Schema não suportado: ' + JSON.stringify(s));
 return result + (s.nullable ? '?' : '');
}
function decode(s, value) {
 if (s.nullable) return value + ' == null ? null : ' + decode({ ...s, nullable: false }, value);
 if (s.allOf?.length === 1) return decode(s.allOf[0], value);
 if (refName(s)) return refName(s) + '.fromJson(' + value + ' as Map<String, dynamic>)';
 if (s.type === 'array') return '(' + value + ' as List<dynamic>).map((e) => ' + decode(s.items, 'e') + ').toList()';
 return value + ' as ' + type(s);
}
function encode(s, value) {
 if (s.allOf?.length === 1) return encode(s.allOf[0], value);
 if (refName(s)) return value + (s.nullable ? '?' : '') + '.toJson()';
 if (s.type === 'array') return value + '.map((e) => ' + encode(s.items, 'e') + ').toList()';
 return value;
}
let out = '// GENERATED FROM packages/contracts/openapi.json. DO NOT EDIT.\n// dart format off\n\n';
for (const [name, schema] of Object.entries(schemas)) {
 if (schema.type !== 'object' || !schema.properties) throw new Error('Unsupported model ' + name);
 const props = Object.entries(schema.properties);
 out += 'class ' + name + ' {\n';
 for (const [key, prop] of props) {
  const optional = !schema.required?.includes(key);
  const t = type(prop);
  out += '  final ' + t + (optional && !t.endsWith('?') ? '?' : '') + ' ' + key + ';\n';
  for (const rule of ['minLength', 'maxLength', 'minimum', 'maximum']) if (prop[rule] !== undefined) out += '  static const ' + key + rule[0].toUpperCase() + rule.slice(1) + ' = ' + prop[rule] + ';\n';
 }
 out += '  const ' + name + '(' + (props.length ? '{' + props.map(([key]) => (schema.required?.includes(key) ? 'required ' : '') + 'this.' + key).join(', ') + '}' : '') + ');\n';
 out += '  factory ' + name + '.fromJson(Map<String, dynamic> json) => ' + (props.length ? '' : 'const ') + name + '(\n';
 for (const [key, prop] of props) {
  const s = { ...prop, nullable: prop.nullable || !schema.required?.includes(key) };
  out += '    ' + key + ': ' + decode(s, "json['" + key + "']") + ',\n';
 }
 out += '  );\n  Map<String, dynamic> toJson() => {\n';
 for (const [key, prop] of props) out += "    '" + key + "': " + encode(prop, key) + ',\n';
 out += '  };\n}\n\n';
}
out += 'typedef JsonTransport = Future<dynamic> Function(String method, String path, Map<String, dynamic>? body);\n\nclass CofreClient {\n  final JsonTransport transport;\n  const CofreClient(this.transport);\n';
for (const [path, verbs] of Object.entries(spec.paths)) for (const [verb, op] of Object.entries(verbs)) {
 const method = op.operationId.replace(/Controller_/, '').replace(/^[A-Z]/, c => c.toLowerCase());
 const input = op.requestBody?.content?.['application/json']?.schema;
 const response = Object.entries(op.responses).find(([status]) => status.startsWith('2'))?.[1].content?.['application/json']?.schema;
 const params = op.parameters ?? [];
 const pathParams = params.filter(p => p.in === 'path');
 const queryParams = params.filter(p => p.in === 'query');
 if (params.some(p => !['path', 'query', 'header', 'cookie'].includes(p.in))) throw new Error('Unsupported parameters: ' + method);
 const args = [...(input ? [type(input) + ' body'] : []), ...pathParams.map(p => type(p.schema) + ' ' + p.name)];
 if (queryParams.length) args.push('{' + queryParams.map(p => (p.required ? 'required ' : '') + type(p.schema) + (p.required ? '' : '?') + ' ' + p.name).join(', ') + '}');
 out += '  Future<' + (response ? type(response) : 'void') + '> ' + method + '(' + args.join(', ') + ') async {\n';
 const dartPath = path.replace(/\{([^}]+)\}/g, (_, name) => '${Uri.encodeComponent(' + name + '.toString())}');
 out += "    final path = '" + dartPath + "';\n";
 if (queryParams.length) {
  out += '    final query = <String, String>{\n';
  for (const p of queryParams) out += '      ' + (p.required ? '' : 'if (' + p.name + ' != null) ') + "'" + p.name + "': " + p.name + '.toString(),\n';
  out += '    };\n    final target = query.isEmpty ? path : Uri(path: path, queryParameters: query).toString();\n';
 }
 out += '    ' + (response ? 'final json = ' : '') + "await transport('" + verb.toUpperCase() + "', " + (queryParams.length ? 'target' : 'path') + ', ' + (input ? 'body.toJson()' : 'null') + ');\n';
 if (response) out += '    return ' + decode(response, 'json') + ';\n';
 out += '  }\n';
}
out += '}\n';
const file = 'apps/flutter_app/lib/generated/api.g.dart';
if (process.argv.includes('--check')) {
 if (readFileSync(file, 'utf8') !== out) throw new Error('Cliente Dart desatualizado; execute pnpm contracts:generate.');
 console.log('Cliente Dart corresponde ao OpenAPI.');
} else { mkdirSync('apps/flutter_app/lib/generated', { recursive: true }); writeFileSync(file, out); console.log('Cliente Dart gerado.'); }
