# Register OnDemand Test Suite

This directory contains comprehensive test scripts for the `register_ondemand.py` script. Each test case is designed to be **idempotent** and checks for existing datasets before execution using the Bioloop API.

## 🚀 Quick Start

### Run All Tests
```bash
# Run all test cases in dry-run mode (recommended for testing)
python run_all_tests.py

# Run all test cases without dry-run (production mode)
python run_all_tests.py --no-dry-run

# Skip checksum verification for faster testing
python run_all_tests.py --skip-checksum
```

### Run Individual Test Cases
```bash
# Run a specific test case by ID
python run_all_tests.py --test-case 2

# Run individual test scripts directly
python test_01_basic_registration.py
python test_02_renaming_with_prefix_suffix.py
# ... etc
```

## 📋 Test Cases Overview

| ID | Name | Description | Hard Links | Verification | Data Size |
|----|------|-------------|------------|--------------|-----------|
| 01 | Basic Registration | No renaming, subdirectory ingestion | ❌ | ❌ | ~3MB |
| 02 | Renaming with Prefix/Suffix | Prefix/suffix renaming + parallel verification | ✅ | ✅ | ~4MB |
| 03 | Hard Linking | Multiple subdirectories with varying file sizes | ✅ | ✅ | ~7MB |
| 04 | Idempotency | Duplicate execution prevention | ❌ | ❌ | ~4MB |
| 05 | Large Dataset | Larger file sizes | ✅ | ✅ | ~20MB |
| 06 | Mixed Content | Nested directories and varying structures | ✅ | ✅ | ~6MB |
| 07 | Error Handling | Error scenarios and edge cases | ❌ | ❌ | ~4MB |
| 08 | Cleanup | Cleanup functionality | ✅ | ✅ | ~4MB |
| 09 | Edge Cases | Non-directory files and edge cases | ❌ | ❌ | ~3MB |
| 10 | Concurrent Execution | Parallel operations with multiple subdirectories | ✅ | ✅ | ~10MB |
| 11 | Large Files | Larger individual files | ✅ | ✅ | ~20MB |
| 12 | Special Characters | Special characters in directory names | ❌ | ❌ | ~4MB |
| 13 | Idempotent Cleanup | Partial failures and multiple runs | ✅ | ✅ | ~6MB |

## 🏗️ Test Architecture

### Test Runner (`run_all_tests.py`)
- **Comprehensive execution** of all test cases
- **Idempotent behavior** - safe to run multiple times
- **API integration** - checks for existing datasets
- **Detailed reporting** - success/failure analysis
- **Configurable options** - dry-run, checksum, specific test cases

### Individual Test Scripts
Each test case has its own script with:
- **Self-contained logic** - creates test data, runs tests, validates results
- **API integration** - checks dataset existence before testing
- **Comprehensive validation** - verifies expected behaviors
- **Detailed logging** - shows what happened and why
- **Error handling** - graceful failure with clear messages

### Test Data Management
- **Automatic creation** - generates test data if not present
- **Configurable sizes** - varies file sizes and counts per test case
- **Cleanup support** - dry-run mode handles cleanup automatically
- **Realistic scenarios** - mimics production data patterns

## 🔧 Configuration Options

### Command Line Arguments
```bash
# Global options (apply to all tests)
--dry-run          # Run in simulation mode (default: True)
--no-dry-run       # Disable dry-run mode
--skip-checksum    # Skip checksum verification
--test-case N      # Run only specific test case by ID

# Per-test options (in individual test scripts)
--dry-run          # Test-specific dry-run control
--skip-checksum    # Test-specific checksum control
```

### Environment Configuration
- **Test Data Base**: `/opt/sca/data/scratch/`
- **Script Path**: `/opt/sca/app/workers/scripts/register_ondemand.py`
- **API Integration**: Uses `workers.api` for dataset existence checks
- **Timeout**: 5 minutes per test case

## 📊 Test Validation

### Success Criteria
Each test case validates:
1. **Return Code**: Script executes successfully (exit code 0)
2. **Expected Behavior**: Hard links, verification, cleanup as expected
3. **Output Patterns**: Key messages appear in script output
4. **Execution Time**: Completes within reasonable time limits
5. **Resource Management**: Proper cleanup of test artifacts

### Validation Patterns
```python
# Example validation logic
hard_links_created = "hard-linked directory created" in output
verification_executed = "Parallel verification" in output
cleanup_executed = "Cleaned up renamed directory" in output
subdirs_processed = "Successfully processed" in output
```

## 🚨 Error Handling

### Common Issues
1. **API Connection**: Network or authentication problems
2. **File Permissions**: Cannot create test data directories
3. **Timeout**: Test execution takes too long
4. **Dataset Conflicts**: Existing datasets in database
5. **Script Errors**: register_ondemand.py execution failures

### Recovery Strategies
- **Automatic retry**: Test runner handles transient failures
- **Graceful degradation**: Continues with remaining test cases
- **Clear error messages**: Shows exactly what went wrong
- **Idempotent execution**: Safe to re-run failed tests

## 🔍 Debugging

### Verbose Output
```bash
# Run with detailed logging
python run_all_tests.py --verbose

# Check individual test output
python test_02_renaming_with_prefix_suffix.py --dry-run
```

### Log Analysis
- **Test execution logs**: Shows command execution and timing
- **Script output**: Captures register_ondemand.py stdout/stderr
- **API responses**: Dataset existence check results
- **Validation results**: Success/failure for each expectation

## 📈 Performance Metrics

### Test Execution Times
- **Basic tests**: 1-5 seconds
- **Hard linking tests**: 5-15 seconds
- **Parallel verification**: 10-30 seconds
- **Large file tests**: 15-60 seconds

### Resource Usage
- **Memory**: Minimal (test data in MB range)
- **Disk**: Temporary test data, automatically cleaned up
- **CPU**: Parallel verification uses configurable worker limits
- **Network**: API calls for dataset existence checks

## 🧪 Testing Best Practices

### Development Workflow
1. **Write test first**: Define expected behavior before implementation
2. **Run in dry-run mode**: Validate logic without side effects
3. **Check API integration**: Ensure dataset existence checks work
4. **Validate cleanup**: Verify resources are properly managed
5. **Document results**: Update test documentation with findings

### Production Testing
1. **Use dry-run mode**: Safe testing in production environments
2. **Monitor execution times**: Watch for performance regressions
3. **Check resource cleanup**: Ensure no orphaned test data
4. **Validate API responses**: Confirm dataset checks work correctly
5. **Test error scenarios**: Verify graceful failure handling

## 🔗 Integration

### CI/CD Pipeline
```yaml
# Example GitHub Actions workflow
- name: Run Register OnDemand Tests
  run: |
    cd workers/workers/scripts/register_ondemand_tests
    python run_all_tests.py --dry-run
```

### Development Environment
```bash
# Local development setup
cd workers/workers/scripts/register_ondemand_tests
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python run_all_tests.py
```

## 📚 Additional Resources

- **TEST_SUMMARY.md**: Comprehensive test results and analysis
- **register_ondemand.py**: Main script being tested
- **workers.api**: API integration for dataset checks
- **workers.config**: Configuration management

## 🤝 Contributing

### Adding New Test Cases
1. **Create test script**: Follow naming convention `test_NN_name.py`
2. **Define test data**: Specify subdirectories, file sizes, expectations
3. **Implement validation**: Check for expected output patterns
4. **Update test runner**: Add to `run_all_tests.py` test cases list
5. **Document behavior**: Update this README with new test details

### Test Case Template
```python
class TestCaseNN:
    def __init__(self):
        self.test_name = "Test Name"
        self.test_id = "NN"
        self.description = "What this test verifies"
        self.data_dir = "test_NN_name"
        self.subdirs = ["subdir1", "subdir2"]
        self.expected_hard_links = 2
        self.expected_verification = True
```

## 📞 Support

For questions or issues with the test suite:
1. **Check logs**: Detailed error messages in test output
2. **Review configuration**: Verify paths and API settings
3. **Test individually**: Run specific test cases to isolate issues
4. **Check dependencies**: Ensure workers.api and config are accessible

---

**Happy Testing! 🧪✨**
