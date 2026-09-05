import Link from 'next/link'

import type { TermsDocProps } from './types'

/**
 * Hebrew terms of use. Long-form legal prose with inline markup, so it lives as
 * a component per language rather than as catalog strings — the same shape the
 * marketing copy uses via getLandingContent(locale).
 */
export function TermsHe({ email, addr, tel, reg, pricing }: TermsDocProps) {
  return (
      <div className="mt-8 space-y-10 text-sm leading-relaxed text-muted-foreground" dir="rtl">

        {/* 1 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">1. מבוא וזהות הצדדים</h2>
          <p>
            תנאי שימוש אלה ("התנאים") מסדירים את היחסים בין{' '}
            <strong className="text-foreground">תורג&apos;מן גואטה הדר מזל</strong>, עוסק פטור מספר{' '}
            <strong className="text-foreground">{reg}</strong>, כתובת:{' '}
            <strong className="text-foreground">{addr}</strong> ("החברה", "Lessio"),
            לבין כל גורם המשתמש בפלטפורמת Lessio ("הלקוח", "המשתמש").
          </p>
          <p className="mt-3">
            השימוש בפלטפורמת Lessio — לרבות רישום חשבון, גישה למערכת, שימוש בפיצ'רים, שימוש
            בפיילוט, פתיחת חשבון ניסיון, כניסה לפורטל הורים, ושימוש בכל חלק מהשירות — מהווה
            הסכמה מלאה ומחייבת לתנאים אלה ולמדיניות הפרטיות של Lessio.
          </p>
          <p className="mt-3">
            פניות תמיכה: <a href={`mailto:${email}`} className="text-violet-600 hover:underline">{email}</a>
            {' · '}
            פניות משפטיות: <a href={`mailto:${email}`} className="text-violet-600 hover:underline">{email}</a>
          </p>
        </section>

        {/* 2 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">2. הגדרות</h2>
          <dl className="space-y-2">
            {[
              ['Lessio / המערכת', 'פלטפורמת התוכנה כשירות (SaaS) המופעלת על ידי החברה, לרבות כל ממשקי המשתמש, ה-API, פורטל ההורים, היישומים הנלווים, מסדי הנתונים והשירותים הקשורים.'],
              ['החברה / מפעילת השירות', 'תורג\'מן גואטה הדר מזל, עוסק פטור מספר 204174361, המפעיל/ת את Lessio ומספק/ת את השירות.'],
              ['לקוח עסקי', 'עסק, מוסד חינוכי, מרכז למידה, מורה פרטי, חברה, עמותה או כל גורם משפטי או יחיד הרוכש גישה ל-Lessio לצורך ניהול פעילות עסקית עצמאית.'],
              ['משתמש מורשה', 'מורה, עובד, מנהל, שותף או כל אדם אחר שהלקוח העסקי הסמיך לגשת למערכת בשמו.'],
              ['משתמש קצה', 'הורה, תלמיד, מורה, עובד או לקוח של הלקוח העסקי המשתמש בחלקים מהמערכת הנגישים לציבור (כגון פורטל הורים), מבלי שהוא עצמו צד ישיר בהסכם עם החברה.'],
              ['תוכן לקוח', 'כל מידע, נתונים, טקסטים, תמונות, קבצים, פרטי קשר, הודעות ותכנים אחרים שהלקוח העסקי מזין למערכת, מעלה אליה או יוצר באמצעותה.'],
              ['ספקי צד שלישי', 'ספקי שירות חיצוניים שהמערכת עשויה להסתמך עליהם, כולל אך לא רק: WhatsApp/Meta, ספקי סליקת אשראי, ספקי חשבוניות, ספקי ענן, שירותי אימייל ו-SMS וכלי אנליטיקה.'],
              ['השירות / השירותים', 'כלל הפונקציונליות, הכלים, הממשקים והיכולות המוצעים דרך Lessio, כפי שיהיו מעת לעת.'],
            ].map(([term, def]) => (
              <div key={term} className="flex gap-2">
                <dt className="font-medium text-foreground shrink-0">"{term}"</dt>
                <dd>— {def}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 3 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">3. קבלת התנאים</h2>
          <p className="mb-2">ביצוע כל אחת מהפעולות הבאות מהווה הסכמה מחייבת לתנאים אלה:</p>
          <ul className="list-disc list-inside space-y-1 mr-3">
            {['הרשמה ויצירת חשבון', 'כניסה למערכת', 'שימוש בכל חלק מהשירות, לרבות בתקופת פיילוט או ניסיון', 'לחיצה על "מסכים", "הצטרפות", "המשך" או אישור דומה בתהליך ההצטרפות', 'שימוש בפורטל ההורים'].map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-3">
            אדם המשתמש במערכת בשם עסק, חברה, עמותה או כל גורם משפטי אחר מצהיר כי הוא מוסמך
            לחייב את אותו גורם משפטי ומקבל את התנאים גם בשמו. מי שאינו מסכים לתנאים נדרש
            להימנע משימוש בשירות.
          </p>
        </section>

        {/* 4 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">4. תיאור השירות</h2>
          <p>
            Lessio מספקת תשתית תפעולית לניהול פעילותם של עסקים בתחום שיעורים פרטיים ומרכזי
            למידה. המערכת עשויה לכלול, מעת לעת, יכולות לניהול: תלמידים, הורים, מורים, שיעורים,
            יומנים, זמינות, ביטולים, נוכחות, הודעות WhatsApp ותזכורות, חיובים, בקשות תשלום,
            סטטוסי תשלום, חיבורים לספקי סליקה וחשבוניות, פורטל הורים, דוחות ותצוגות ניהוליות.
          </p>
          <p className="mt-3">
            Lessio היא מערכת תפעולית המסייעת לניהול תהליכים. היא <strong className="text-foreground">אינה</strong> ספקית
            סליקה, אינה בנק, אינה חברת אשראי, אינה שירות הנהלת חשבונות, אינה יועצת מס, ואינה
            מנפיקה חשבוניות מס בשם הלקוח אלא אם כן מוסכם מפורשות אחרת.
          </p>
          <p className="mt-3">
            הפיצ'רים, יכולות, ממשקים ושירותי צד שלישי זמינים במסגרת Lessio עשויים להשתנות,
            להתווסף, להיות מוגבלים, מוסרים או מעודכנים מעת לעת, בכפוף למתן הודעה סבירה
            במקרים של שינוי מהותי.
          </p>
        </section>

        {/* 5 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">5. פיילוט, גרסת בטא ושימוש חינמי</h2>
          <p>
            Lessio מציעה תקופת ניסיון של{' '}
            <strong className="text-foreground">30 יום ללא תשלום וללא צורך בכרטיס אשראי</strong>.
            בתום התקופה, המעבר לתכנית בתשלום טעון הסכמה מפורשת.
          </p>
          <p className="mt-3">
            שימוש חינמי ניתן <strong className="text-foreground">כמות שהוא ("as is")</strong>,
            ללא כל התחייבות לזמינות, יציבות, המשכיות, שלמות נתונים, ביצועים, תמיכה מלאה
            או התאמה לצרכים ספציפיים.
          </p>
          <p className="mt-3">
            החברה שומרת לעצמה את הזכות להפסיק, להגביל, לשנות או לשדרג שימוש חינמי בכל עת,
            בהודעה סבירה מראש ככל הניתן. שימוש חינמי אינו מקנה זכות לרצף שימוש חינמי ואינו
            מונע מהחברה לדרוש מעבר לתשלום בכל עת.
          </p>
        </section>

        {/* 6 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">6. חשבון משתמש והרשאות</h2>
          <ul className="list-disc list-inside space-y-2 mr-3">
            <li>הלקוח העסקי אחראי לשמור על סודיות פרטי הכניסה לחשבונו.</li>
            <li>הלקוח אחראי לכל פעולה המבוצעת דרך חשבונו — בין אם על ידו ובין אם על ידי משתמשים מורשים שהוסיף.</li>
            <li>הלקוח אחראי להגדיר הרשאות מתאימות למורים, לעובדים ולמשתמשים מורשים. החברה אינה אחראית לגישה בלתי מורשית הנובעת מהגדרות שגויות של הלקוח.</li>
            <li>
              הלקוח מתחייב להודיע לחברה מיידית לכתובת{' '}
              <a href={`mailto:${email}`} className="text-violet-600 hover:underline">{email}</a>
              {' '}בכל מקרה של חשד לשימוש בלתי מורשה בחשבונו.
            </li>
          </ul>
        </section>

        {/* 7 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">7. אחריות הלקוח העסקי</h2>
          <div className="space-y-3">
            <p><strong className="text-foreground">נכונות המידע:</strong> הלקוח אחראי לנכונות, לדיוק ולעדכניות כל המידע שהוא מזין למערכת.</p>
            <p><strong className="text-foreground">הסכמות ורשויות:</strong> הלקוח מצהיר כי השיג את כל ההסכמות, ההרשאות והאישורים הנדרשים על פי דין לשם הזנת מידע אישי של תלמידים, הורים, מורים ועובדים, ושליחת הודעות ובקשות תשלום.</p>
            <p><strong className="text-foreground">עמידה בדין:</strong> הלקוח אחראי לעמוד בכל הדינים החלים עליו — חוק הגנת הפרטיות, חוק התקשורת (הודעות מסחריות), חוק הגנת הצרכן, הוראות ניהול ספרים, דיני מס וכל הוראה ענפית רלוונטית.</p>
            <p><strong className="text-foreground">תוכן הודעות:</strong> הלקוח אחראי לכל תוכן שישלח ללקוחותיו דרך המערכת. Lessio היא ערוץ שליחה בלבד.</p>
            <p><strong className="text-foreground">הודעת פתיחה והסרה:</strong> לפני ההודעה העסקית הראשונה שנשלחת להורה, המערכת שולחת הודעת פתיחה חד-פעמית המציינת מטעם מי נשלחות ההודעות, אילו סוגי הודעות יישלחו, וכיצד ניתן להפסיקן (בתשובה "הסר" או "stop"). הורה שביקש להפסיק אינו מקבל עוד הודעות עסקיות מכל סוג. אין באמור כדי לגרוע מאחריות הלקוח לקבל את ההסכמות הנדרשות על פי דין.</p>
            <p><strong className="text-foreground">יחסים עם לקוחות:</strong> הלקוח אחראי לתעריפים, תנאי ביטול, החזרים, גבייה, מדיניות תשלומים וכל מחלוקת בינו לבין לקוחותיו.</p>
            <p><strong className="text-foreground">ייעוץ מקצועי:</strong> הפעלת Lessio אינה מהווה ייעוץ משפטי, חשבונאי, מסחרי או מס, ואינה מחליפה ייעוץ מקצועי כאמור.</p>
          </div>
        </section>

        {/* 8 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">8. מידע על קטינים</h2>
          <p>המערכת עשויה לשמש לניהול מידע על תלמידים קטינים (מתחת לגיל 18).</p>
          <p className="mt-3">
            הלקוח העסקי מצהיר ומאשר כי הוא בעל הזכות החוקית להזין, לאחסן ולעבד מידע אישי
            הנוגע לתלמידים קטינים, וכי קיבל את ההסכמות הנדרשות על פי דין מהורים ו/או אפוטרופוסים
            חוקיים. הלקוח אחראי למסור הודעות פרטיות מתאימות ולהסדיר הסכמות בהתאם לחוק.
          </p>
          <p className="mt-3">
            Lessio אינה אחראית לוודא שהלקוח קיבל את ההסכמות הנדרשות, ותפעל בהתאם לחוק
            ולמדיניות הפרטיות שלה ביחס לכל בקשה הנוגעת למידע כזה.
          </p>
        </section>

        {/* 9 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">9. פרטיות ועיבוד מידע</h2>
          <p>
            השימוש במידע אישי שנאסף במסגרת השירות מוסדר במדיניות הפרטיות של Lessio
            (זמינה בכתובת <Link href="/privacy" className="text-violet-600 hover:underline">/privacy</Link>)
            , המהווה חלק בלתי נפרד מתנאים אלה.
          </p>
          <p className="mt-3">
            הלקוח מעניק ל-Lessio הרשאה לעבד את המידע הדרוש להפעלת השירות, מתן תמיכה,
            תחזוקה ושיפורו. החברה רשאית לעבד מידע לצרכי אבטחה, תמיכה טכנית, ניתוח ביצועים,
            עמידה בדין ומניעת שימוש לרעה.
          </p>
          <p className="mt-3">
            Lessio <strong className="text-foreground">לא תמכור</strong> מידע אישי מזוהה לצדדים
            שלישיים לצרכי שיווק. החברה עשויה לעבד נתונים אנונימיים או מצרפיים (שאינם מאפשרים
            זיהוי אדם ספציפי) לצרכי שיפור השירות וניתוח מגמות.
          </p>
        </section>

        {/* 10 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">10. ספקי צד שלישי</h2>
          <p>
            Lessio עשויה להסתמך, לצורך מתן השירות, על ספקים חיצוניים, כולל ולא רק: WhatsApp/Meta,
            ספקי סליקת אשראי, ספקי הנפקת חשבוניות, ספקי שירותי ענן, שירותי אימייל ו-SMS
            וספקי אנליטיקה.
          </p>
          <p className="mt-3">
            החברה <strong className="text-foreground">אינה אחראית</strong> לזמינות, ביצועים,
            מדיניות, שינויים, חסימות, תקלות, שינויי תנאים או כל כשל של ספקי צד שלישי — לרבות
            חסימת חשבון WhatsApp, כשל בסליקה, שינוי API, או השבתת שירות ענן.
          </p>
          <p className="mt-3">
            הלקוח אחראי לחיבור חשבונותיו לשירותים חיצוניים, לקבלת ההרשאות הנדרשות, לנכונות
            פרטי הסליקה שלו, ולעמידה בתנאי השימוש של אותם ספקים.
          </p>
        </section>

        {/* 11 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">11. תשלומים, מנויים וביטולים</h2>

          <h3 className="font-medium text-foreground mt-4 mb-2">11.1 תכניות ומחירים</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse border border-border rounded">
              <thead>
                <tr className="bg-muted">
                  <th className="border border-border px-3 py-2 text-right font-medium text-foreground">תכנית</th>
                  <th className="border border-border px-3 py-2 text-right font-medium text-foreground">חודשי</th>
                  <th className="border border-border px-3 py-2 text-right font-medium text-foreground">שנתי</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['חינמי (ניסיון 30 יום)', '₪0', '—'],
                  ...pricing.map((p) => [
                    p.labelHe,
                    `₪${p.priceMonthly.toLocaleString('he-IL')}/חודש`,
                    p.priceYearly != null ? `₪${p.priceYearly.toLocaleString('he-IL')}/שנה` : '—',
                  ]),
                  ['מותאם אישית', 'לפי הצעת מחיר', '—'],
                ].map(([plan, monthly, annual]) => (
                  <tr key={plan}>
                    <td className="border border-border px-3 py-2">{plan}</td>
                    <td className="border border-border px-3 py-2">{monthly}</td>
                    <td className="border border-border px-3 py-2">{annual}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            המחירים סופיים וללא מע"מ. Lessio שומרת לעצמה את הזכות לשנות מחירים בהודעה מוקדמת
            של 30 יום.
          </p>

          <h3 className="font-medium text-foreground mt-4 mb-2">11.2 איחור בתשלום</h3>
          <p>
            איחור בתשלום עשוי להוביל להגבלת גישה לשירות, השעיית חשבון, ובמקרה של אי תשלום
            ממושך — לסיום ההתקשרות. החברה תשלח תזכורת לפני נקיטת פעולה.
          </p>

          <h3 className="font-medium text-foreground mt-4 mb-2">11.3 ביטול</h3>
          <p>
            הלקוח רשאי לבטל את מנויו בכל עת באמצעות שליחת אימייל לכתובת{' '}
            <a href={`mailto:${email}`} className="text-violet-600 hover:underline">{email}</a>
            {' '}או לחיצה על "ביטול מנוי" בממשק ניהול החשבון.
            ביטול ייכנס לתוקף בתום תקופת החיוב הנוכחית. לא יינתן החזר יחסי עבור תקופה שהחלה,
            בכפוף לכל דין מחייב.
          </p>

          <h3 className="font-medium text-foreground mt-4 mb-2">11.4 מדיניות החזר</h3>
          <p>
            לקוח הנמצא בתוך <strong className="text-foreground">14 יום מהחיוב הראשון בלבד</strong>{' '}
            רשאי לבקש החזר מלא. לאחר מכן לא ינתן החזר יחסי, בכפוף לכל דין מחייב.
          </p>

          <h3 className="font-medium text-foreground mt-4 mb-2">11.5 לקוח צרכני</h3>
          <p>
            ככל שהלקוח הוא "צרכן" כהגדרתו בחוק הגנת הצרכן, תשמ"א-1981, יחולו זכויות הביטול
            הקבועות בחוק זה, לרבות הזכות לביטול עסקה תוך 14 יום, ככל שהדבר חל לפי נסיבות
            העסקה הספציפית.
          </p>
        </section>

        {/* 12 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">12. זמינות, תחזוקה ושינויים</h2>
          <p>
            השירות ניתן <strong className="text-foreground">"כמות שהוא" ו"כפי שזמין"</strong>,
            ללא כל התחייבות לזמינות רציפה, ביצועים ברמה מסוימת, נטולת תקלות, או התאמה מלאה
            לצרכי הלקוח. החברה אינה מתחייבת לרמת זמינות (SLA) ספציפית, אלא אם נקבע אחרת
            בהסכם מיוחד ובכתב.
          </p>
          <p className="mt-3">
            ייתכנו הפסקות שירות מתוכננות לצורך תחזוקה, עדכונים ושדרוגים — החברה תעשה מאמץ
            סביר לבצע תחזוקה מחוץ לשעות השיא. ייתכנו גם הפסקות לא מתוכננות הנובעות מתשתיות
            ספקי צד שלישי, שאינן בשליטת החברה.
          </p>
        </section>

        {/* 13 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">13. שימוש אסור</h2>
          <p className="mb-2">הלקוח מתחייב שלא לעשות, ושלא לאפשר לאחרים לעשות, כל אחד מאלה:</p>
          <ul className="list-disc list-inside space-y-1 mr-3">
            {[
              'שימוש בשירות לכל מטרה בלתי חוקית, מטעה, הונאתית או המפרה זכויות של אחרים.',
              'עיבוד, אחסון או שידור מידע אישי ללא הרשאה חוקית, בניגוד לחוק הגנת הפרטיות.',
              'שליחת הודעות מסחריות, פרסומת או ספאם ללא הסכמה מפורשת של הנמען, כנדרש בחוק התקשורת.',
              'ניסיון לפרוץ, לגשת ללא הרשאה, לעקוף מנגנוני אבטחה, לבצע reverse engineering, scraping אוטומטי, DoS, או לפגוע בפעילות המערכת.',
              'התחזות לאדם, לעסק, לנציג Lessio, לרשות ממשלתית או לכל גורם אחר.',
              'הזנת מידע שגוי, מטעה, לא מורשה, גנוב, מפר זכויות יוצרים, מסית, מגונה, פוגעני, משמיץ או בלתי חוקי.',
              'שימוש המפר את תנאי WhatsApp/Meta, ספקי הסליקה, ספקי החשבוניות או כל ספק צד שלישי.',
              'מכירה, העברה, השכרה או מתן גישה במשנה לצד שלישי ללא אישור מפורש ובכתב.',
            ].map(item => <li key={item}>{item}</li>)}
          </ul>
        </section>

        {/* 14 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">14. קניין רוחני</h2>
          <p>
            כל הזכויות בפלטפורמת Lessio — לרבות קוד המקור, עיצוב, מותג, לוגו, לוגיקה עסקית,
            תהליכים, מסכים, ממשקים ותיעוד — שייכות לחברה ו/או לבעלי הרישיון שלה ומוגנות
            בדיני קניין רוחני.
          </p>
          <p className="mt-3">
            הלקוח מקבל רישיון שימוש אישי, מוגבל, לא בלעדי, לא ניתן להעברה ולא ניתן לתת-רישיון,
            לשימוש בשירות לצרכיו הפנימיים, לתקופת ההתקשרות בלבד.
          </p>
          <p className="mt-3">
            תוכן לקוח נשאר בבעלות הלקוח ו/או נושאי המידע, לפי הדין החל. Lessio רשאית להשתמש
            בנתונים אנונימיים ו/או מצרפיים (שאינם מאפשרים זיהוי אדם ספציפי) לצרכי שיפור
            המוצר וניתוח ביצועים.
          </p>
        </section>

        {/* 15 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">15. סודיות</h2>
          <p>
            כל צד מתחייב לשמור בסוד מידע עסקי חסוי של הצד האחר שנחשף לו במסגרת ההתקשרות.
            התחייבות זו לא תחול על מידע שהיה ידוע קודם לגילויו, מידע שהפך לציבורי שלא באשמת
            הצד המקבל, ומידע שנדרש לגילוי על פי דין, צו שיפוטי או דרישה של רשות מוסמכת.
            Lessio רשאית לחשוף מידע לספקי שירות הפועלים בשמה, ובלבד שאלה כפופים לחובות
            סודיות דומות.
          </p>
        </section>

        {/* 16 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">16. הגבלת אחריות</h2>
          <p>
            במידה המרבית המותרת על פי דין, לא תישא Lessio באחריות לנזקים עקיפים, תוצאתיים,
            מקריים, מיוחדים, ענישתיים, לאובדן רווחים, הכנסות, עסקאות, לקוחות, מוניטין, מידע,
            אפילו אם הוזהרה על אפשרות נזקים כאלה.
          </p>
          <p className="mt-3">
            Lessio אינה אחראית לנזקים הנובעים מ: תקלות, חסימות, שינויים של ספקי צד שלישי;
            טעויות במידע שהלקוח הזין; שימוש שגוי של הלקוח; חיובים שגויים, ביטולים, או אי גבייה
            הנובעים ממידע שגוי שנמסר; אי זמינות זמנית של המערכת.
          </p>
          <p className="mt-3">
            האחריות הכוללת של Lessio כלפי הלקוח, בכל עילה שהיא, לא תעלה על{' '}
            <strong className="text-foreground">סכום התשלומים ששולמו בפועל ל-Lessio ב-3 החודשים
            שקדמו לאירוע הנזק</strong>.
          </p>
          <p className="mt-3">
            אין בתנאים אלה כדי להגביל אחריות שלא ניתן להגבילה על פי דין, לרבות נזק שנגרם
            בזדון או ברשלנות רבתי.
          </p>
        </section>

        {/* 17 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">17. שיפוי</h2>
          <p className="mb-2">
            הלקוח מתחייב לשפות, להגן ולפצות את Lessio, מנהליה, עובדיה וספקיה בגין כל תביעה,
            נזק, הוצאה או עלות ייעוץ משפטי הנובעים מ:
          </p>
          <ul className="list-disc list-inside space-y-1 mr-3">
            {[
              'שימוש אסור בשירות על ידי הלקוח או מי מטעמו.',
              'הפרת כל הוראה בתנאים אלה או כל דין החל על הלקוח.',
              'הפרת זכויות פרטיות של הורים, תלמידים, מורים, עובדים או צדדים שלישיים.',
              'תכנים שהלקוח שלח באמצעות המערכת.',
              'אי קבלת הסכמות הנדרשות על פי דין.',
              'מחלוקות בין הלקוח העסקי לבין לקוחותיו, תלמידיו, הוריהם, מוריו או עובדיו.',
            ].map(item => <li key={item}>{item}</li>)}
          </ul>
        </section>

        {/* 18 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">18. השעיה, הגבלה וסיום</h2>
          <p className="mb-2">
            Lessio רשאית להשעות, להגביל או לסיים את גישת הלקוח במקרים הבאים:
          </p>
          <ul className="list-disc list-inside space-y-1 mr-3 mb-3">
            {[
              'הפרה מהותית של תנאי שימוש אלה.',
              'אי תשלום שלא תוקן תוך 7 ימי עסקים מהודעה.',
              'חשש מבוסס לשימוש בלתי חוקי, הונאה או פגיעה בצדדים שלישיים.',
              'דרישה מחייבת של גורם רשמי, רשות, בית משפט או ספק צד שלישי.',
              'סיכון אבטחה מיידי או פגיעה בפעילות המערכת.',
            ].map(item => <li key={item}>{item}</li>)}
          </ul>
          <p>ככל שניתן, Lessio תיתן הודעה מוקדמת לפני השעיה, למעט במקרי חירום אבטחה.</p>
          <p className="mt-3">
            לאחר סיום ההתקשרות, עשויה הגישה למערכת להיחסם. נתוני הלקוח יישמרו{' '}
            <strong className="text-foreground">90 יום</strong> לאחר סיום ההתקשרות.
            במהלך תקופה זו ניתן לבקש ייצוא נתונים בכתב לכתובת{' '}
            <a href={`mailto:${email}`} className="text-violet-600 hover:underline">{email}</a>.
            לאחר 90 יום המידע עשוי להימחק לצמיתות.
          </p>
        </section>

        {/* 19 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">19. שינויים בתנאים</h2>
          <p>
            Lessio רשאית לעדכן תנאים אלה מעת לעת. שינוי מהותי יפורסם בממשק המשתמש ו/או
            יישלח בהודעה לכתובת האימייל הרשומה בחשבון, לפחות{' '}
            <strong className="text-foreground">14 יום</strong> לפני כניסת השינוי לתוקף.
            המשך שימוש בשירות לאחר כניסת השינויים לתוקף ייחשב כהסכמה לתנאים המעודכנים.
            לקוח שאינו מסכים רשאי לבטל את מנויו לפני כניסת השינויים לתוקף.
          </p>
        </section>

        {/* 20 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">20. דין חל וסמכות שיפוט</h2>
          <p>
            תנאים אלה כפופים לדין מדינת ישראל, מבלי להחיל כללי ברירת דין המפנים לדין זר.
            הסמכות הבלעדית לדון בכל מחלוקת תהיה לבתי המשפט המוסמכים{' '}
            <strong className="text-foreground">במחוז תל אביב</strong>. אין בסעיף זה כדי לגרוע
            מזכויות הצרכן לבחירת פורום שיפוטי מוסמך אחר, ככל שהדין מאפשר זאת.
          </p>
        </section>

        {/* 21 */}
        <section>
          <h2 className="text-base font-semibold text-foreground mb-3">21. יצירת קשר</h2>
          <div className="space-y-1">
            <p>
              <strong className="text-foreground">תמיכה כללית:</strong>{' '}
              <a href={`mailto:${email}`} className="text-violet-600 hover:underline">{email}</a>
            </p>
            <p>
              <strong className="text-foreground">פניות משפטיות ופרטיות:</strong>{' '}
              <a href={`mailto:${email}`} className="text-violet-600 hover:underline">{email}</a>
            </p>
            <p><strong className="text-foreground">טלפון:</strong> {tel}</p>
            <p><strong className="text-foreground">כתובת דואר:</strong> {addr}</p>
          </div>
        </section>

      </div>
  )
}
