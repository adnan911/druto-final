import {
  users,
  merchantAccounts,
  apiKeys,
  paymentIntents,
  paymentTransactions,
  webhookEndpoints,
  webhookDeliveries,
  walletLoginChallenges,
} from "../drizzle/schema";

export interface MemoryStore {
  users: any[];
  merchantAccounts: any[];
  apiKeys: any[];
  paymentIntents: any[];
  paymentTransactions: any[];
  webhookEndpoints: any[];
  webhookDeliveries: any[];
  walletLoginChallenges: any[];
  [key: string]: any[];
}

function getTableName(table: any): string {
  if (!table) return "unknown";
  if (typeof table === "string") return table;
  if (table._ && table._.name) return table._.name;
  if (table[Symbol.for("drizzle:Name")]) return table[Symbol.for("drizzle:Name")];
  if (table === users) return "users";
  if (table === merchantAccounts) return "merchantAccounts";
  if (table === apiKeys) return "apiKeys";
  if (table === paymentIntents) return "paymentIntents";
  if (table === paymentTransactions) return "paymentTransactions";
  if (table === webhookEndpoints) return "webhookEndpoints";
  if (table === webhookDeliveries) return "webhookDeliveries";
  if (table === walletLoginChallenges) return "walletLoginChallenges";
  return "unknown";
}

export function createMemoryDb() {
  const store: MemoryStore = {
    users: [
      {
        id: 1,
        openId: "druto-operator-operator-druto-xyz",
        name: "Druto Operator",
        email: "operator@druto.xyz",
        loginMethod: "account",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
    ],
    merchantAccounts: [
      {
        id: "ma_druto_labs",
        marketplaceId: "druto-demo-marketplace",
        externalSellerId: "druto-labs",
        ownerUserId: 1,
        displayName: "Druto Labs",
        receivingAddress: "0xA32c7bbB2fb634bED4DfC812c15AF87a0C727217",
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "ma_mosaic_works",
        marketplaceId: "druto-demo-marketplace",
        externalSellerId: "mosaic-works",
        ownerUserId: 1,
        displayName: "Mosaic Works",
        receivingAddress: "0xA32c7bbB2fb634bED4DfC812c15AF87a0C727217",
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    apiKeys: [],
    paymentIntents: [
      {
        id: "pi_demo_1842",
        externalOrderId: "DR-1842",
        marketplaceId: "druto-demo-marketplace",
        sellerId: "druto-labs",
        merchantAccountId: "ma_druto_labs",
        idempotencyKey: "marketplace-druto-1842",
        itemName: "Arc API Pro — annual access",
        buyerLabel: "Demo Buyer",
        returnUrl: "/marketplace",
        orderContext: JSON.stringify({
          items: [
            {
              productId: "api-pro",
              name: "Arc API Pro",
              seller: "Druto Labs",
              unitPrice: 1,
              quantity: 1,
            },
          ],
          delivery: "Standard",
          shippingAddress: {
            name: "Demo Buyer",
            line1: "100 Crypto Way",
            city: "San Francisco",
            postalCode: "94107",
            country: "US",
          },
          buyerEmail: "buyer@example.com",
        }),
        amountAtomic: "1000000",
        asset: "USDC",
        network: "arc-testnet",
        merchantAddress: "0xA32c7bbB2fb634bED4DfC812c15AF87a0C727217",
        buyerAddress: "0x71C56538B1810578d0f191A78401340B2D497143",
        status: "succeeded",
        transactionHash: "0x9876543210abcdef9876543210abcdef9876543210abcdef9876543210abcdef",
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    paymentTransactions: [
      {
        id: 1,
        paymentIntentId: "pi_demo_1842",
        transactionHash: "0x9876543210abcdef9876543210abcdef9876543210abcdef9876543210abcdef",
        fromAddress: "0x71C56538B1810578d0f191A78401340B2D497143",
        toAddress: "0xA32c7bbB2fb634bED4DfC812c15AF87a0C727217",
        tokenAddress: "0x3600000000000000000000000000000000000000",
        amountAtomic: "1000000",
        chainId: 5042002,
        finalizedAt: new Date(),
        createdAt: new Date(),
      },
    ],
    webhookEndpoints: [],
    webhookDeliveries: [],
    walletLoginChallenges: [],
  };

  function getTableList(table: any): any[] {
    const name = getTableName(table);
    if (!store[name]) {
      store[name] = [];
    }
    return store[name];
  }

  function matchesCondition(row: any, condition: any): boolean {
    if (!condition) return true;
    if (condition.operator === "and" || condition.type === "and") {
      const conds = condition.conditions || condition.chunks || [];
      return conds.every((c: any) => matchesCondition(row, c));
    }
    if (condition.operator === "or" || condition.type === "or") {
      const conds = condition.conditions || condition.chunks || [];
      return conds.some((c: any) => matchesCondition(row, c));
    }
    if (condition.operator === "not" || condition.type === "not") {
      return !matchesCondition(row, condition.value || condition.condition);
    }
    if (condition.queryChunks && Array.isArray(condition.queryChunks)) {
      // Drizzle SQL expression chunks
      let matched = true;
      for (const chunk of condition.queryChunks) {
        if (chunk && typeof chunk === "object") {
          if ("conditions" in chunk) {
            if (!matchesCondition(row, chunk)) return false;
          } else if (chunk.left && chunk.right !== undefined) {
            const col = chunk.left.name || chunk.left.columnName;
            const val = chunk.right?.value !== undefined ? chunk.right.value : chunk.right;
            if (row[col] !== val) return false;
          }
        }
      }
      return matched;
    }

    if (condition.left && condition.right !== undefined) {
      const col = condition.left.name || condition.left.columnName || condition.left;
      const val = condition.right?.value !== undefined ? condition.right.value : condition.right;
      return row[col] === val;
    }

    if (condition.column && condition.values) {
      // inArray
      const col = condition.column.name || condition.column.columnName || condition.column;
      const values = Array.isArray(condition.values) ? condition.values : [];
      return values.includes(row[col]);
    }

    if (condition.column && condition.operator === "isNull") {
      const col = condition.column.name || condition.column.columnName || condition.column;
      return row[col] === null || row[col] === undefined;
    }

    return true;
  }

  function projectRow(row: any, shape?: any) {
    if (!shape || typeof shape !== "object") return { ...row };
    const res: any = {};
    for (const [key, field] of Object.entries(shape)) {
      const colName = (field as any)?.name || (field as any)?.columnName || key;
      res[key] = row[colName] !== undefined ? row[colName] : row[key];
    }
    return res;
  }

  const memoryDb = {
    select: (shape?: any) => {
      let currentTable: any = null;
      let whereClause: any = null;
      let limitCount: number | null = null;
      let joinedTable: any = null;
      let joinCondition: any = null;

      const queryBuilder: any = {
        from: (table: any) => {
          currentTable = table;
          return queryBuilder;
        },
        innerJoin: (otherTable: any, onCondition: any) => {
          joinedTable = otherTable;
          joinCondition = onCondition;
          return queryBuilder;
        },
        where: (condition: any) => {
          whereClause = condition;
          return queryBuilder;
        },
        orderBy: () => queryBuilder,
        limit: (n: number) => {
          limitCount = n;
          return queryBuilder;
        },
        then: (resolve: any, reject: any) => {
          try {
            const list = getTableList(currentTable);
            let results: any[] = [];

            if (joinedTable) {
              const otherList = getTableList(joinedTable);
              for (const rowA of list) {
                for (const rowB of otherList) {
                  const combined = { ...rowB, ...rowA };
                  if (matchesCondition(combined, whereClause)) {
                    results.push(projectRow(combined, shape));
                  }
                }
              }
            } else {
              for (const row of list) {
                if (matchesCondition(row, whereClause)) {
                  results.push(projectRow(row, shape));
                }
              }
            }

            if (limitCount !== null) {
              results = results.slice(0, limitCount);
            }
            resolve(results);
          } catch (err) {
            if (reject) reject(err);
            else throw err;
          }
        },
      };

      return queryBuilder;
    },

    insert: (table: any) => {
      const list = getTableList(table);
      let duplicateUpdateSet: any = null;

      const insertBuilder: any = {
        values: (data: any) => {
          const rowsToInsert = Array.isArray(data) ? data : [data];
          for (const item of rowsToInsert) {
            const row = {
              id: item.id || list.length + 1,
              createdAt: new Date(),
              updatedAt: new Date(),
              ...item,
            };

            // Check if unique key exists for onDuplicateKeyUpdate
            const existingIndex = list.findIndex(r => {
              if (item.openId && r.openId === item.openId) return true;
              if (item.id && r.id === item.id) return true;
              if (item.idempotencyKey && r.idempotencyKey === item.idempotencyKey) return true;
              return false;
            });

            if (existingIndex >= 0) {
              if (duplicateUpdateSet) {
                Object.assign(list[existingIndex], duplicateUpdateSet, { updatedAt: new Date() });
              }
            } else {
              list.push(row);
            }
          }
          return insertBuilder;
        },
        onDuplicateKeyUpdate: (opts: { set: any }) => {
          duplicateUpdateSet = opts.set;
          return insertBuilder;
        },
        then: (resolve: any) => {
          resolve([{ affectedRows: 1 }]);
        },
      };

      return insertBuilder;
    },

    update: (table: any) => {
      const list = getTableList(table);
      let setValues: any = {};

      const updateBuilder: any = {
        set: (values: any) => {
          setValues = values;
          return updateBuilder;
        },
        where: (condition: any) => {
          let affected = 0;
          for (const row of list) {
            if (matchesCondition(row, condition)) {
              Object.assign(row, setValues, { updatedAt: new Date() });
              affected++;
            }
          }
          return {
            then: (resolve: any) => resolve([{ affectedRows: affected }]),
          };
        },
      };

      return updateBuilder;
    },

    delete: (table: any) => {
      const list = getTableList(table);
      return {
        where: (condition: any) => {
          const initialLen = list.length;
          const filtered = list.filter(r => !matchesCondition(r, condition));
          list.length = 0;
          list.push(...filtered);
          return {
            then: (resolve: any) => resolve([{ affectedRows: initialLen - filtered.length }]),
          };
        },
      };
    },
  };

  return memoryDb;
}
