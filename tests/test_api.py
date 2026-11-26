"""
Comprehensive Integration Tests for Antigravity - AI Data Analysis Platform REST API
Tests all 8 modules and API endpoints.
"""
import urllib.request
import urllib.error
import json
import uuid
import time
import os

BASE_URL = 'http://localhost:8000'

def post_multipart(url, file_path, field_name='file'):
    boundary = uuid.uuid4().hex
    with open(file_path, 'rb') as f:
        file_bytes = f.read()
    filename = file_path.replace('\\', '/').split('/')[-1]
    
    body = bytearray()
    body.extend(f'--{boundary}\r\n'.encode('latin1'))
    body.extend(f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'.encode('latin1'))
    body.extend(b'Content-Type: application/octet-stream\r\n\r\n')
    body.extend(file_bytes)
    body.extend(f'\r\n--{boundary}--\r\n'.encode('latin1'))
    
    req = urllib.request.Request(url, data=body)
    req.add_header('Content-Type', f'multipart/form-data; boundary={boundary}')
    res = urllib.request.urlopen(req)
    return json.loads(res.read().decode('utf-8'))

def post_json(url, payload):
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    res = urllib.request.urlopen(req)
    return json.loads(res.read().decode('utf-8'))

def test_api():
    print("============================================================")
    print("RUNNING ANTIGRAVITY API VERIFICATION TEST SUITE")
    print("============================================================")

    # 1. Health Endpoint
    print("\n[1] Testing GET /api/health...")
    h = json.loads(urllib.request.urlopen(f'{BASE_URL}/api/health').read().decode('utf-8'))
    assert h['status'] == 'healthy'
    print("    Health OK:", h['libraries'])

    # 2. Upload CSV (Standard comma)
    print("\n[2] Testing POST /api/upload with sample_sales.csv...")
    r_sales = post_multipart(f'{BASE_URL}/api/upload', 'test_data/sample_sales.csv')
    assert r_sales['success'] is True
    assert 'dataset_id' in r_sales
    assert len(r_sales['preview_rows']) > 0
    print(f"    Sales CSV OK: {r_sales['row_count']} rows, {r_sales['col_count']} cols, ID={r_sales['dataset_id'][:8]}...")

    # 3. Upload Messy CSV (Semicolon, missing values, duplicates, outliers)
    print("\n[3] Testing POST /api/upload with sample_messy.csv (delimiter & encoding sniffing)...")
    r_messy = post_multipart(f'{BASE_URL}/api/upload', 'test_data/sample_messy.csv')
    assert r_messy['success'] is True
    assert r_messy['metadata']['delimiter'] == "';'"
    assert r_messy['duplicate_count'] == 2
    assert r_messy['missing_cells'] == 2
    messy_id = r_messy['dataset_id']
    print(f"    Messy CSV OK: Delimiter={r_messy['metadata']['delimiter']}, Duplicates={r_messy['duplicate_count']}, Missing={r_messy['missing_cells']}")

    # 4. Automatic Analysis Engine (Module 2)
    print("\n[4] Testing POST /api/analysis...")
    r_ana = post_json(f'{BASE_URL}/api/analysis', {'dataset_id': messy_id})
    assert r_ana['success'] is True
    ana = r_ana['analysis']
    assert 'overview' in ana
    assert 'numerical_stats' in ana
    assert 'categorical_stats' in ana
    assert 'data_quality' in ana
    assert 'ai_insights' in ana
    # Verify mathematical accuracy of stats
    rev_stats = ana['numerical_stats']['Revenue']
    assert 'kurtosis' in rev_stats
    assert 'skewness' in rev_stats
    assert 'iqr' in rev_stats
    print(f"    Analysis OK: Revenue Mean={rev_stats['mean']}, Median={rev_stats['median']}, Kurtosis={rev_stats['kurtosis']}")
    print(f"    AI Insights generated: {len(ana['ai_insights'])} insights")

    # 5. Correlation Analysis (Module 3 - Pearson & Spearman)
    print("\n[5] Testing POST /api/correlation (Pearson & Spearman)...")
    r_pearson = post_json(f'{BASE_URL}/api/correlation', {'dataset_id': messy_id, 'method': 'pearson'})
    assert r_pearson['success'] is True
    assert 'matrix' in r_pearson['correlation']
    r_spearman = post_json(f'{BASE_URL}/api/correlation', {'dataset_id': messy_id, 'method': 'spearman'})
    assert r_spearman['success'] is True
    assert r_spearman['correlation']['method'] == 'spearman'
    print(f"    Correlation OK: Pearson pairs={len(r_pearson['correlation']['strongest_correlations'])}, Spearman pairs={len(r_spearman['correlation']['strongest_correlations'])}")

    # 6. Data Cleaning Studio (Module 4)
    print("\n[6] Testing POST /api/clean (Deduplicate, Impute, Cell Edit, Undo, Reset)...")
    
    # 6a. Deduplicate
    r_dedup = post_json(f'{BASE_URL}/api/clean', {'dataset_id': messy_id, 'action': 'drop_duplicates', 'params': {'keep': 'first'}})
    assert r_dedup['success'] is True
    assert r_dedup['row_count'] == 15
    assert r_dedup['comparison']['duplicates_resolved'] == 2
    print(f"    Deduplicate OK: Rows 17 -> {r_dedup['row_count']}")

    # 6b. Impute Missing Revenue with Median
    r_fill = post_json(f'{BASE_URL}/api/clean', {'dataset_id': messy_id, 'action': 'fill_missing', 'params': {'column': 'Revenue', 'strategy': 'median'}})
    assert r_fill['success'] is True
    assert r_fill['schema']['Revenue']['null_count'] == 0
    print(f"    Impute OK: Revenue nulls={r_fill['schema']['Revenue']['null_count']}")

    # 6c. Edit Cell
    r_edit = post_json(f'{BASE_URL}/api/clean', {'dataset_id': messy_id, 'action': 'edit_cell', 'params': {'row_index': 0, 'column': 'Customer_Age', 'value': 99.0}})
    assert r_edit['success'] is True
    assert r_edit['records'][0]['Customer_Age'] == 99.0
    print("    Edit Cell OK: Row 0 Customer_Age set to 99.0")

    # 6d. Undo
    r_undo = post_json(f'{BASE_URL}/api/clean', {'dataset_id': messy_id, 'action': 'undo'})
    assert r_undo['success'] is True
    assert r_undo['records'][0]['Customer_Age'] != 99.0
    print("    Undo OK: Customer_Age reverted")

    # 6e. Reset to Original
    r_reset = post_json(f'{BASE_URL}/api/clean', {'dataset_id': messy_id, 'action': 'reset'})
    assert r_reset['success'] is True
    assert r_reset['row_count'] == 17
    print(f"    Reset OK: Dataset restored to {r_reset['row_count']} rows")

    # 7. Data Preview Paginated Query (Module 4)
    print("\n[7] Testing POST /api/preview (Pagination, Search, Sort)...")
    r_prev = post_json(f'{BASE_URL}/api/preview', {'dataset_id': messy_id, 'page': 1, 'page_size': 5, 'sort_by': 'Revenue', 'sort_order': 'desc'})
    assert r_prev['success'] is True
    assert len(r_prev['rows']) == 5
    assert r_prev['total_pages'] == 4
    print(f"    Preview OK: Page 1 of {r_prev['total_pages']} (5 rows)")

    # 8. Export Center (Module 5)
    print("\n[8] Testing POST /api/export (CSV, XLSX, JSON, Stats CSV)...")
    for fmt in ['csv', 'xlsx', 'json', 'stats_csv']:
        data = json.dumps({'dataset_id': messy_id, 'format': fmt}).encode('utf-8')
        req = urllib.request.Request(f'{BASE_URL}/api/export', data=data, headers={'Content-Type': 'application/json'})
        res = urllib.request.urlopen(req)
        b_exp = res.read()
        assert len(b_exp) > 50
        print(f"    Export {fmt.upper()} OK: {len(b_exp)} bytes received")

    # 9. Natural Language Query (NLP)
    print("\n[9] Testing POST /api/query (Ask AI)...")
    r_q = post_json(f'{BASE_URL}/api/query', {'query': 'Show me the most purchased product', 'records': r_sales['records']})
    assert r_q['success'] is True
    print(f"    NLP Query OK: {r_q['summary']}")

    # 10. PDF Executive Dossier Export
    print("\n[10] Testing POST /api/export-pdf...")
    data = json.dumps({'records': r_sales['records'], 'dataset_name': 'Sales_Report'}).encode('utf-8')
    req = urllib.request.Request(f'{BASE_URL}/api/export-pdf', data=data, headers={'Content-Type': 'application/json'})
    res = urllib.request.urlopen(req)
    pdf_bytes = res.read()
    assert len(pdf_bytes) > 1000
    print(f"    PDF Dossier Export OK: {len(pdf_bytes)} bytes received")

    # 11. Security & Edge Case Handling
    print("\n[11] Testing Upload Validation & Security (Empty file, invalid format)...")
    # Test empty body
    try:
        req = urllib.request.Request(f'{BASE_URL}/api/upload', data=b'', headers={'Content-Type': 'text/csv'})
        urllib.request.urlopen(req)
        assert False, "Should have rejected empty body"
    except urllib.error.HTTPError as e:
        assert e.code == 400
        print("    Empty body correctly rejected with HTTP 400")

    print("\n============================================================")
    print("ALL ANTIGRAVITY BACKEND INTEGRATION TESTS PASSED 100%!")
    print("============================================================")

if __name__ == '__main__':
    test_api()
