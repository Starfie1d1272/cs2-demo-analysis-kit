import { parse } from '@babel/parser';

// One syntax-aware inventory for source graph checks and emitted ESM normalization.
export function packageImports(source, filename) {
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'], sourceFilename: filename });
  const imports = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    let literal;
    let typeOnly = false;
    if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type)) {
      literal = node.source;
      typeOnly = node.importKind === 'type' || node.exportKind === 'type' ||
        (['ImportDeclaration', 'ExportNamedDeclaration'].includes(node.type) && node.specifiers.length > 0 && node.specifiers.every(s => s.importKind === 'type' || s.exportKind === 'type'));
    }
    if (node.type === 'TSImportType') { literal = node.source; typeOnly = true; }
    if (node.type === 'ImportExpression') literal = node.source;
    if (node.type === 'CallExpression' && (node.callee.type === 'Import' || (node.callee.type === 'Identifier' && node.callee.name === 'require'))) literal = node.arguments[0];
    if (literal) {
      if (literal.type !== 'StringLiteral') throw new Error(`${filename}: nonliteral module dependency requires an explicit boundary decision`);
      imports.push({ specifier: literal.value, start: literal.start + 1, end: literal.end - 1, typeOnly });
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(ast.program);
  return imports;
}
