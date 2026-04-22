const RAILWAY_TOKEN = "2ea5e23d-0550-4586-87ab-125a6b05af3b";
const RAILWAY_API_URL = "https://backboard.railway.app/graphql/v2";

async function getVars() {
    const q = `
      query {
        projects {
          edges {
            node {
              id
              name
              services {
                edges {
                  node {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
    `;
    const response = await fetch(RAILWAY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RAILWAY_TOKEN}`,
      },
      body: JSON.stringify({ query: q }),
    });
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
}

getVars();
