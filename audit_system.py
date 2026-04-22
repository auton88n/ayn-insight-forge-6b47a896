import os
import re
import subprocess
import json

def run_cmd(cmd):
    try:
        return subprocess.check_output(cmd, shell=True, stderr=subprocess.STDOUT).decode()
    except Exception as e:
        return str(e)

def audit():
    print("Starting System-Wide Integration Audit...")
    
    # 1. Get Tables from Railway (via provided URL)
    db_url = "postgresql://postgres:YVyREXhxrlbdTUxlzZgiGGtnRYTdgcNP@nozomi.proxy.rlwy.net:21118/railway"
    print(f"Auditing Database tables at {db_url.split('@')[-1]}...")
    
    table_cmd = f"psql '{db_url}' -t -c \"SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public';\""
    tables = run_cmd(table_cmd).strip().split('\n')
    tables = [t.strip() for t in tables if t.strip() and not t.strip().startswith('pg_')]
    
    print(f"Found {len(tables)} tables.")

    # 2. Map Tables to Backend Files
    table_map = {}
    for table in tables:
        # Search in ayn-backend excluding migrations
        grep_cmd = f"grep -r \"{table}\" ayn-backend --exclude-dir=migrations | grep -v \".pyc\" | wc -l"
        refs = run_cmd(grep_cmd).strip()
        table_map[table] = int(refs) if refs.isdigit() else 0

    # 3. Analyze Backend Routes
    print("Analyzing Backend Routes...")
    routes = []
    # Search for @router.get/post/etc in routers directory
    route_pattern = re.compile(r'@router\.(get|post|put|delete)\("([^"]+)"')
    router_dir = "ayn-backend/routers"
    for root, _, files in os.walk(router_dir):
        for file in files:
            if file.endswith(".py"):
                with open(os.path.join(root, file), 'r') as f:
                    content = f.read()
                    matches = route_pattern.findall(content)
                    # Get the prefix if it exists in the file
                    prefix_match = re.search(r'router = APIRouter\(prefix="([^"]+)"', content)
                    prefix = prefix_match.group(1) if prefix_match else ""
                    for method, path in matches:
                        routes.append({
                            "method": method.upper(),
                            "path": f"{prefix}{path}".replace("//", "/"),
                            "file": file
                        })

    # 4. Map Routes to Frontend
    print("Mapping Backend Routes to Frontend...")
    route_audit = []
    for route in routes:
        path_segments = route["path"].split("/")
        # We search for the unique part of the path (avoiding common things like /api/)
        search_path = route["path"]
        if search_path.startswith("/"): search_path = search_path[1:]
        
        grep_cmd = f"grep -r \"{search_path}\" src | wc -l"
        refs = run_cmd(grep_cmd).strip()
        route_audit.append({
            **route,
            "frontend_refs": int(refs) if refs.isdigit() else 0
        })

    # 5. Generate Report
    report = {
        "tables": {
            "total": len(tables),
            "active": [t for t, r in table_map.items() if r > 0],
            "orphaned": [t for t, r in table_map.items() if r == 0]
        },
        "routes": route_audit
    }

    with open("full_system_audit.json", "w") as f:
        json.dump(report, f, indent=2)
    
    print("\nAudit Complete! Results saved to full_system_audit.json")
    
    # Print summary
    print(f"\n--- SUMMARY ---")
    print(f"Active Tables: {len(report['tables']['active'])}")
    print(f"Orphaned Tables: {len(report['tables']['orphaned'])}")
    print(f"Total Routes: {len(routes)}")
    connected_routes = [r for r in route_audit if r['frontend_refs'] > 0]
    print(f"Connected Routes (used in frontend): {len(connected_routes)}")
    disconnected_routes = [r for r in route_audit if r['frontend_refs'] == 0]
    print(f"Disconnected Routes: {len(disconnected_routes)}")

if __name__ == "__main__":
    audit()
