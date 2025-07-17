// https://dev.to/jacobandrewsky/writing-local-rules-for-eslint-58bl
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-inner-declarations */
module.exports = {
  'no-original-prisma-inside-tx': {
    // async function main() {
    //   prisma.$transaction(async (tx) => {
    //     await prisma.user.findFirst(); // ❌ incorrect, should use `tx`
    //     await tx.user.findFirst(); // ✅ correct
    //   });
    // }
    meta: {
      type: 'problem',
      docs: {
        description: 'Disallow usage of original Prisma client inside a transaction callback',
        recommended: true,
      },
      schema: [],
    },
    create(context) {
      return {
        CallExpression(node) {
          // Match prisma.$transaction(...) where prisma is any identifier
          // console.log('Checking node:', node.type, node.callee && node.callee.type,
          // node.callee && node.callee.property && node.callee.property.name);
          if (
            node.callee
              && node.callee.type === 'MemberExpression'
              && node.callee.property.name === '$transaction'
              && node.arguments.length >= 1
          ) {
            const originalClientName = node.callee.object.type === 'Identifier' ? node.callee.object.name : null;
            const callbackFn = node.arguments[0];

            if (!originalClientName
                  || !['FunctionExpression', 'ArrowFunctionExpression'].includes(callbackFn.type)) {
              return;
            }

            const txParam = callbackFn.params[0];
            if (!txParam || txParam.type !== 'Identifier') return;

            const txParamName = txParam.name;

            // Walk inside callbackFn body
            function checkNode(childNode) {
              if (
                childNode.type === 'MemberExpression'
                  && childNode.object.type === 'Identifier'
                  && childNode.object.name === originalClientName
              ) {
                context.report({
                  node: childNode,
                  message: `Do not use original Prisma client '${originalClientName}'`
                    + ` inside a transaction. Use '${txParamName}' instead.`,
                });
              }
            }

            // const sourceCode = context.getSourceCode();
            const callbackBody = callbackFn.body;
            const visited = new WeakSet();

            const traverse = (child) => {
              if (!child || typeof child !== 'object' || visited.has(child)) {
                return;
              }
              visited.add(child);

              checkNode(child);
              // Only traverse specific AST node properties to avoid circular references
              // and prevent visiting parent nodes
              const nodeProps = ['body', 'expression', 'expressions', 'left', 'right',
                'object', 'property', 'callee', 'arguments', 'elements',
                'properties', 'value', 'init', 'test', 'consequent',
                'alternate', 'declarations', 'declarators', 'argument'];

              for (const key of nodeProps) {
                if (Object.prototype.hasOwnProperty.call(child, key)) {
                  const val = child[key];
                  if (Array.isArray(val)) {
                    val.forEach(traverse);
                  } else if (val && typeof val === 'object' && val.type) {
                    traverse(val);
                  }
                }
              }
            };

            traverse(callbackBody);
          }
        },
      };
    },
  },
};
