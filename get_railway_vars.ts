const ACCESS_TOKEN = "TDNB9I73A92J9JNb1iwGSx9DzPzLnL0Izpk6tv16gBm";
const RAILWAY_API_URL = "https://backboard.railway.app/graphql/v2";
const PROJECT_ID = "961330c2-288a-4bc1-b81b-7fff00cb5e47";
const ENVIRONMENT_ID = "7f8332ee-0849-4ad5-b3c2-c665c42d0027";

async function getVars() {
    const q = `
      query VariableValues($environmentId: String!, $projectId: String!) {
        variableValues(environmentId: $environmentId, projectId: $projectId)
      }
    `;
    const response = await fetch(RAILWAY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify({ 
        query: q,
        variables: { projectId: PROJECT_ID, environmentId: ENVIRONMENT_ID }
      }),
    });
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
}

getVars();
