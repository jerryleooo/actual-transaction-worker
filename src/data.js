const BUDGET_API_BASE =
    "http://37.27.18.247:5007/v1/budgets/5e3d0cb1-b508-49fe-a0ca-f9a3610be5a8";

const API_HEADERS = {
    accept: "application/json",
    "x-api-key": "31a69feede0034113a9259cfa31396fc",
};

let accountsCache;
let categoriesCache;

async function fetchBudgetResource(resource) {
    const url = `${BUDGET_API_BASE}/${resource}`;
    const response = await fetch(url, {
        method: "GET",
        headers: API_HEADERS,
    });
    const bodyText = await response.text();

    if (!response.ok) {
        throw new Error(
            `Failed to fetch ${resource}: ${response.status} ${bodyText}`
        );
    }

    try {
        return JSON.parse(bodyText);
    } catch (e) {
        throw new Error(`Failed to parse ${resource} response: ${bodyText}`);
    }
}

export async function getAccounts() {
    if (!accountsCache) {
        const json = await fetchBudgetResource("accounts");
        accountsCache = json.data;
    }

    return accountsCache;
}

export async function getCategories() {
    if (!categoriesCache) {
        const json = await fetchBudgetResource("categories");
        categoriesCache = json.data;
    }

    return categoriesCache;
}
