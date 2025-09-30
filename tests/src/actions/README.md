# Page Object Model (POM) for Upload Tests

This directory contains the Page Object Model implementation for the upload feature E2E tests using Playwright.

## Structure

### Core Actions (`datasetUpload.js`)
Low-level actions that interact with individual UI elements:

- `selectDatasetType()` - Select dataset type from dropdown
- `selectSourceRawData()` - Select source raw data from autocomplete
- `selectProject()` - Select project from autocomplete
- `selectSourceInstrument()` - Select source instrument from dropdown
- `clearAutoComplete()` - Clear an autocomplete field using the reset button
- `assertAutoCompleteEmpty()` - Assert that an autocomplete field is empty
- `assertCheckboxState()` - Assert that a checkbox is in the expected state
- `assertSelectValue()` - Assert that a Select field has the expected value
- `trackSelectedFilesMetadata()` - Track selected files metadata from the upload table
- `navigateToNextStep()` - Navigate to next step
- `navigateToPreviousStep()` - Navigate to previous step
- `typeInputValue()` - Fill dataset name in upload details
- `selectFiles()` - Select files for upload
- `verifyStepButtonState()` - Verify step button enabled/disabled state
- `verifyFormError()` - Verify form validation errors

## Usage Examples

### Basic Action Usage
```javascript
import { 
  selectDatasetType, 
  selectSourceRawData, 
  selectProject, 
  selectSourceInstrument,
  clearAutoComplete,
  assertAutoCompleteEmpty,
  assertCheckboxState,
  assertSelectValue,
  trackSelectedFilesMetadata,
  navigateToNextStep,
  selectFiles,
  typeInputValue,
} from '../actions/datasetUpload';

// Select dataset type by name
await selectDatasetType({ 
  page, 
  datasetType: 'Raw Data',
  verify: true 
});

// Select source raw data by index
await selectSourceRawData({ 
  page, 
  resultIndex: 0,
  verify: true 
});

// Select project with verification
await selectProject({ 
  page, 
  resultIndex: 0,
  verify: true 
});

// Select source instrument with verification
await selectSourceInstrument({ 
  page, 
  optionIndex: 0,
  verify: true 
});

// Clear autocomplete field
await clearAutoComplete({
  page,
  testId: 'upload-metadata-dataset-autocomplete',
  verify: true
});

// Assert autocomplete field is empty
await assertAutoCompleteEmpty({
  page,
  testId: 'upload-metadata-dataset-autocomplete'
});

// Assert checkbox state
await assertCheckboxState({
  page,
  testId: 'upload-metadata-assign-source-checkbox',
  expectedState: true  // true for checked, false for unchecked
});

// Assert checkbox state when checkbox is within a row container
await assertCheckboxState({
  page,
  testId: 'upload-metadata-assign-project-row',
  expectedState: true,
  isRowContainer: true  // Use this when the testId refers to a row container
});

// Assert select field value
await assertSelectValue({
  page,
  testId: 'upload-metadata-dataset-type-select',
  expectedValue: 'Data Product'
});

// Track selected files metadata
const selectedFiles = await trackSelectedFilesMetadata({ page });
// Returns array of objects: [{ name: 'file1.txt', size: '1.2 KB' }, ...]

// Navigate to next step
await navigateToNextStep({ page });

// Select files for upload
await selectFiles({ 
  page, 
  filePaths: ['/path/to/file1.txt', '/path/to/file2.txt']
});

// Fill dataset name
await typeInputValue({
  page,
  datasetName: 'My Test Dataset',
  verify: true
});
```

### Complete Workflow Example
```javascript
// Step 1: File Selection
const filePaths = attachments.map((file) => `${attachmentManager.getPath()}/${file.name}`);
await selectFiles({ page, filePaths });

// Track selected files for later verification
const selectedFiles = await trackSelectedFilesMetadata({ page });

await navigateToNextStep({ page });

// Step 2: General Info
await selectDatasetType({ page, datasetType: 'Raw Data', verify: true });
await selectSourceRawData({ page, resultIndex: 0, verify: true });
await selectProject({ page, resultIndex: 0, verify: true });
await selectSourceInstrument({ page, optionIndex: 0, verify: true });
await navigateToNextStep({ page });

// Step 3: Upload Details
await typeInputValue({ page, datasetName: 'Test Dataset', verify: true });
```

## Best Practices

1. **Use individual actions for specific interactions** - Each action is designed for a specific UI interaction.

2. **Always verify selections when important** - Use the `verify` parameter to ensure selections were successful.

3. **Handle errors gracefully** - The actions include proper error handling and validation.

4. **Use descriptive test names** - Make test names clear about what they're testing.

5. **Group related tests** - Use `test.describe()` to group related test scenarios.

6. **Import only what you need** - Import only the actions you'll use in each test file.

7. **Use assertion methods for validation** - Use `assertAutoCompleteEmpty()`, `assertCheckboxState()`, and `assertSelectValue()` instead of manual assertions for consistency.

8. **Track file metadata when needed** - Use `trackSelectedFilesMetadata()` to capture file information for later verification.

## Test Data Management

The tests use the `withAttachments` fixture for file management:
- Creates temporary files for testing
- Automatically cleans up after tests
- Provides consistent file paths across test runs

## Error Handling

The actions include comprehensive error handling:
- Validates required parameters
- Checks for element visibility before interaction
- Provides descriptive error messages
- Handles dropdown option not found scenarios

## Maintenance

When updating the POM:
1. Update actions when UI elements change
2. Add new actions for new functionality
3. Update documentation and examples
4. Ensure all tests still pass after changes 