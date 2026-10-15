import * as ast from 'typescript/unstable/ast';
import { readdirSync } from 'node:fs';
import path from 'node:path';

export function checkInterfaceUsage(program, sourceRoot, legacyPublicInterfaces) {
  const sources = program.getSourceFileNames()
    .filter(file => file.startsWith(sourceRoot + path.sep) && file.endsWith('.ts'));
  const exportsByFile = new Map();
  const resolving = new Set();
  const violations = [];

  function declaration(source, name) {
    for (const node of source.statements) {
      if (ast.isVariableStatement(node)) {
        if (node.declarationList.declarations.some(item => item.name.text === name)) {
          return { file: source.fileName, name, node };
        }
      } else if (node.name?.text === name) {
        return { file: source.fileName, name, node };
      }
    }
    return undefined;
  }

  function resolveModule(file, specifier) {
    if (!specifier?.startsWith('.')) return undefined;
    return path.resolve(path.dirname(file), specifier.replace(/\.js$/, '.ts'));
  }

  function exportedSymbols(file) {
    const cached = exportsByFile.get(file);
    if (cached) return cached;
    if (resolving.has(file)) return new Map();
    const source = program.getSourceFile(file);
    if (!source) return new Map();
    resolving.add(file);
    const result = new Map();
    for (const node of source.statements) {
      if (node.modifiers?.some(modifier => ast.isExportKeyword(modifier))) {
        if (ast.isVariableStatement(node)) {
          for (const item of node.declarationList.declarations) {
            if (item.name.text) result.set(item.name.text, { file, name: item.name.text, node });
          }
        } else if (node.name?.text) {
          result.set(node.name.text, { file, name: node.name.text, node });
        }
      }
      if (!ast.isExportDeclaration(node)) continue;
      const target = resolveModule(file, node.moduleSpecifier?.text);
      const targetExports = target ? exportedSymbols(target) : new Map();
      if (node.exportClause && ast.isNamedExports(node.exportClause)) {
        for (const item of node.exportClause.elements) {
          const importedName = item.propertyName?.text ?? item.name.text;
          const resolved = target
            ? targetExports.get(importedName)
            : declaration(source, importedName);
          if (resolved) result.set(item.name.text, resolved);
        }
      } else if (!node.exportClause) {
        for (const [name, resolved] of targetExports) result.set(name, resolved);
      }
    }
    resolving.delete(file);
    exportsByFile.set(file, result);
    return result;
  }

  function interfaceId(symbol) {
    const module = path.relative(sourceRoot, symbol.file).split(path.sep)[0];
    return `${module}:${symbol.name}`;
  }

  function interfaceKey(symbol) {
    return `${symbol.file}:${symbol.name}`;
  }

  const publicSymbols = new Map();
  const facadeFiles = [path.join(sourceRoot, 'index.ts')];
  for (const entry of readdirSync(path.join(sourceRoot, 'exports'))) {
    if (entry.endsWith('.ts')) facadeFiles.push(path.join(sourceRoot, 'exports', entry));
  }
  for (const facade of facadeFiles) {
    for (const symbol of exportedSymbols(facade).values()) {
      if (!ast.isInterfaceDeclaration(symbol.node)) continue;
      const key = interfaceKey(symbol);
      const facadeId = `${path.basename(facade, '.ts')}:${symbol.name}`;
      const legacyId = legacyPublicInterfaces.has(facadeId)
        ? facadeId
        : publicSymbols.get(key)?.legacyId;
      publicSymbols.set(key, { symbol, legacyId });
    }
  }
  const publicInterfaceKeys = new Set(publicSymbols.keys());
  const publicInterfaces = new Set([...publicSymbols.values()].map(
    ({ symbol, legacyId }) => legacyId ?? interfaceId(symbol)));
  const legacyPublicKeys = new Set([...publicSymbols]
    .filter(([, value]) => legacyPublicInterfaces.has(value.legacyId ?? interfaceId(value.symbol)))
    .map(([key]) => key));

  const implementedInterfaces = new Set();
  for (const file of sources) {
    const source = program.getSourceFile(file);
    const imports = new Map();
    const namespaces = new Map();
    for (const node of source.statements) {
      if (!ast.isImportDeclaration(node)) continue;
      const target = resolveModule(file, node.moduleSpecifier?.text);
      if (!target) continue;
      const targetExports = exportedSymbols(target);
      const bindings = node.importClause?.namedBindings;
      if (bindings && ast.isNamedImports(bindings)) {
        for (const item of bindings.elements) {
          imports.set(item.name.text, targetExports.get(item.propertyName?.text ?? item.name.text));
        }
      } else if (bindings && ast.isNamespaceImport(bindings)) {
        namespaces.set(bindings.name.text, targetExports);
      }
    }
    for (const node of source.statements) {
      if (!ast.isClassDeclaration(node)) continue;
      for (const clause of node.heritageClauses ?? []) {
        if (ast.formatSyntaxKind(clause.token) !== 'ImplementsKeyword') continue;
        for (const entry of clause.types) {
          const expression = entry.expression.getText(source);
          const [namespace, member] = expression.split('.');
          const symbol = member
            ? namespaces.get(namespace)?.get(member)
            : imports.get(expression);
          if (symbol && ast.isInterfaceDeclaration(symbol.node)) {
            implementedInterfaces.add(interfaceKey(symbol));
          }
        }
      }
    }
  }

  for (const file of sources) {
    const source = program.getSourceFile(file);
    for (const node of source.statements) {
      if (!ast.isInterfaceDeclaration(node)) continue;
      const key = interfaceKey({ file, name: node.name.text });
      if (implementedInterfaces.has(key)) continue;
      if (legacyPublicKeys.has(key) && publicInterfaceKeys.has(key)) continue;
      const location = source.getLineAndCharacterOfPosition(node.getStart(source));
      violations.push(`${path.relative(sourceRoot, file)}:${location.line + 1}: ` +
        `Interface ${node.name.text} is not implemented by a class; use type`);
    }
  }
  for (const id of legacyPublicInterfaces) {
    if (!publicInterfaces.has(id)) {
      violations.push(`Public interface ${id} is missing from the current package entrypoints`);
    }
  }
  return { violations, publicInterfaces, implementedInterfaces };
}
