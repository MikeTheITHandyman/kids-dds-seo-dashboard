import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Only allowed in development' }, { status: 403 });
  }

  const queries = [
    "pediatric dentist Grayslake",
    "kids dentist Lake County",
    "best pediatric dentist near me"
  ];

  const engines = ["Google", "ChatGPT", "Claude", "Gemini"];
  
  const seedData = [];
  // generate 30 days of mock data
  for (let i = 0; i < 30; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (29 - i));
    const dateString = date.toISOString().split('T')[0];

    for (const query of queries) {
      for (const engine of engines) {
        // Mock rank logic: Google is stable, ChatGPT/Claude fluctuates
        let baseRank = engine === 'Google' ? 2 : 5;
        let rank = Math.max(1, Math.floor(baseRank + (Math.random() * 4) - 2));
        
        seedData.push({
          date: dateString,
          engine_type: engine,
          query: query,
          rank_score: rank,
          volume: Math.floor(Math.random() * 500) + 100
        });
      }
    }
  }

  try {
    const batch = adminDb.batch();
    const collectionRef = adminDb.collection('visibility_metrics');
    
    // Simple approach: batch write 100 at a time or loop since it's around 360 records
    let count = 0;
    for (const data of seedData) {
      const docRef = collectionRef.doc();
      batch.set(docRef, data);
      count++;
      
      // Firestore batch limit is 500
      if (count === 490) {
        await batch.commit();
        // Since seedData is < 400, this is just a safe guard
      }
    }
    
    await batch.commit();
    return NextResponse.json({ success: true, count: seedData.length });
  } catch (error: any) {
    console.error('Seed error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
