// Unit tests for Deterministic Mention Detector
import { detectBrandMention } from '../lib/ai-harness/detector';

function assertEqual(actual: any, expected: any, testName: string) {
  if (actual === expected) {
    console.log(`✅ PASS: ${testName}`);
  } else {
    console.error(`❌ FAIL: ${testName}\n   Expected: ${expected}\n   Actual:   ${actual}`);
    process.exitCode = 1;
  }
}

console.log("=== Running Mention Detector Unit Tests ===\n");

// Test 1: Exact required fixture: "Kids Dentist, PC - Situated in Gurnee" -> COLLISION
{
  const fixture = `
Here are pediatric dentists in Lake County:
1. Gurnee Smile Center - Gurnee, IL
2. Kids Dentist, PC - Situated in Gurnee, specializing in pediatric dental care.
3. Libertyville Dental Associates - Libertyville, IL
`;
  const result = detectBrandMention(fixture);
  assertEqual(result.mentionClass, 'COLLISION', 'Fixture: Kids Dentist, PC - Situated in Gurnee must be COLLISION');
  assertEqual(result.isMentioned, false, 'Collision must not count as isMentioned');
}

// Test 2: Exact required fixture: "Dr. Sonia Gutierrez at Kids Dentist in Grayslake" -> STRONG
{
  const fixture = `
Top recommendations in Grayslake:
1. Grayslake Family Dental
2. Dr. Sonia Gutierrez at Kids Dentist in Grayslake (160 Commerce Dr)
3. Prairie Dental
`;
  const result = detectBrandMention(fixture);
  assertEqual(result.mentionClass, 'STRONG', 'Fixture: Dr. Sonia Gutierrez at Kids Dentist in Grayslake must be STRONG');
  assertEqual(result.isMentioned, true, 'STRONG must be isMentioned: true');
  assertEqual(result.listPosition, 2, 'List position should correctly identify item #2');
}

// Test 3: Exact required fixture: response about unrelated Grayslake practices -> NONE
{
  const fixture = `
Here are highly recommended pediatric dental practices in Grayslake, IL:
1. Michael Scheske, DDS - Grayslake, IL
2. Affiliated Dental Specialists - Gurnee, IL
3. Little Smiles Dentistry - Libertyville, IL
`;
  const result = detectBrandMention(fixture);
  assertEqual(result.mentionClass, 'NONE', 'Fixture: Unrelated Grayslake practices must be NONE');
  assertEqual(result.isMentioned, false, 'NONE must not count as isMentioned');
}

// Test 4: Domain name match -> STRONG
{
  const fixture = `Visit their website at www.kidsdds.com for booking an appointment.`;
  const result = detectBrandMention(fixture);
  assertEqual(result.mentionClass, 'STRONG', 'Domain name match (kidsdds.com) must be STRONG');
  assertEqual(result.isMentioned, true, 'Domain match isMentioned');
}

// Test 5: Phone number match -> STRONG
{
  const fixture = `You can call their pediatric team directly at (847) 223-1400.`;
  const result = detectBrandMention(fixture);
  assertEqual(result.mentionClass, 'STRONG', 'Phone number match ((847) 223-1400) must be STRONG');
  assertEqual(result.isMentioned, true, 'Phone match isMentioned');
}

// Test 6: Other doctors from practice (Rutcosky / Alrayyes / Compton) -> STRONG
{
  const fixture = `Dr. Dave Rutcosky is highly regarded for gentle pediatric restorative treatments.`;
  const result = detectBrandMention(fixture);
  assertEqual(result.mentionClass, 'STRONG', 'Doctor name match (Rutcosky) must be STRONG');
  assertEqual(result.isMentioned, true, 'Doctor match isMentioned');
}

// Test 7: WEAK match: Kids Dentist with Grayslake and no conflicting town
{
  const fixture = `
Recommended practices:
- Kids Dentist is located in Grayslake and provides caring pediatric oral health services.
`;
  const result = detectBrandMention(fixture);
  assertEqual(result.mentionClass, 'WEAK', 'Kids Dentist in Grayslake without doctor/domain must be WEAK');
  assertEqual(result.isMentioned, true, 'WEAK isMentioned: true');
}

// Test 8: Empty / error string -> NONE
{
  const fixture = `[API ERROR: Model timed out]`;
  const result = detectBrandMention(fixture);
  assertEqual(result.mentionClass, 'NONE', 'Error strings must yield NONE');
  assertEqual(result.isMentioned, false, 'Error string not mentioned');
}

console.log("\n=== Finished Unit Tests ===");
