
# Plan: Add PSA Support to Graded Comics Intake

## Overview
Add a PSA/CGC grading service toggle to the Graded Comics Intake component, following the same pattern already working in Graded Card Intake. PSA started grading comics in late 2024, so this enables intake of PSA-graded comics and magazines.

## Changes Required

### 1. Update `GradedComicIntake.tsx`

**Add grading service state:**
```text
const [gradingService, setGradingService] = useState<'psa' | 'cgc'>('cgc');
```

**Add RadioGroup toggle in the UI** (before the certificate input):
```text
<RadioGroup value={gradingService} onValueChange={...}>
  <RadioGroupItem value="psa" /> PSA
  <RadioGroupItem value="cgc" /> CGC
</RadioGroup>
```

**Update the fetch function to call the correct edge function:**
- If `gradingService === 'psa'`: call `psa-lookup` with `{ cert_number: certNumber }`
- If `gradingService === 'cgc'`: call `cgc-lookup` with `{ certNumber }` (current behavior)

**Map PSA response fields to comic fields:**
| PSA Field | Comic Field |
|-----------|-------------|
| `subject` | `title` |
| `brandTitle` | `publisher` |
| `cardNumber` | `issueNumber` |
| `year` | `year` |
| `grade` | `grade` |
| `varietyPedigree` | (for variants/notes) |

**Update display component conditionally:**
- Show `PSACertificateDisplay` when `gradingService === 'psa'`
- Show `CGCCertificateDisplay` when `gradingService === 'cgc'`

**Update catalog snapshot on submit:**
```text
catalog_snapshot_in: {
  ...comicData,
  [gradingService === 'psa' ? 'psa_cert' : 'cgc_cert']: formData.certNumber,
  grading_company: gradingService.toUpperCase(),
  type: gradingService === 'psa' ? 'psa_comic' : 'cgc_comic'
}
```

**Reset form data when grading service changes:**
```text
useEffect(() => {
  setComicData(null);
  setFetchState('idle');
  setError(null);
  setCertInput("");
}, [gradingService]);
```

### 2. Update UI Labels

Update dynamic labels based on selected service:
- Card title: "Graded Comics Intake (PSA)" or "Graded Comics Intake (CGC)"
- Certificate input label: "PSA Certificate Number" or "CGC Certificate Number"

### 3. Add Required Imports

```text
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PSACertificateDisplay } from "@/components/PSACertificateDisplay";
import type { PSACertificateData } from "@/types/psa";
```

## Technical Details

### PSA API Response for Comics

PSA returns the same structure for comics as cards:
- `certNumber`: Certificate number
- `grade`: Numeric grade (1-10)
- `brandTitle`: Publisher/Brand (e.g., "Marvel Comics")
- `subject`: Comic title (e.g., "Amazing Spider-Man")
- `cardNumber`: Issue number (e.g., "129")
- `category`: Will show "COMICS" or "MAGAZINES"
- `year`: Publication year
- `varietyPedigree`: Variant information
- `imageUrl`/`imageUrls`: Slab images

### Field Mapping Logic

```text
// When gradingService === 'psa'
setFormData(prev => ({
  ...prev,
  title: psaData.subject || "",           // Subject = Comic title
  publisher: psaData.brandTitle || "",     // Brand = Publisher
  issueNumber: psaData.cardNumber || "",   // CardNumber = Issue #
  year: psaData.year || "",
  grade: psaData.grade || "",
}));

// When gradingService === 'cgc' (existing logic)
setFormData(prev => ({
  ...prev,
  title: cgcData.title || "",
  issueNumber: cgcData.issueNumber || "",
  publisher: cgcData.publisher || cgcData.seriesName || "",
  year: cgcData.year?.toString() || "",
  grade: cgcData.grade || "",
}));
```

### Database Storage

Both PSA and CGC comics will be stored in `intake_items` with:
- `grading_company`: "PSA" or "CGC"
- `psa_cert` or `cgc_cert`: Certificate number (in catalog_snapshot)
- `main_category`: "comics"
- `type`: "psa_comic" or "cgc_comic"

## Files to Modify

1. `src/components/GradedComicIntake.tsx` - Add PSA/CGC toggle and dual-API support

## Visual Result

The component will have a radio toggle at the top:
```
[○ PSA]  [● CGC]

CGC Certificate Number: [____________] [Fetch Data]
```

When PSA is selected:
```
[● PSA]  [○ CGC]

PSA Certificate Number: [____________] [Fetch Data]
```

## Testing Approach

1. Toggle between PSA and CGC - form should reset
2. Enter a PSA comic cert number (when you have one) - should fetch and populate
3. Enter a CGC comic cert number - existing behavior works
4. Submit with each service - verify `grading_company` and cert fields saved correctly
