import logging
import random
import sys
import time

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s', )
logger = logging.getLogger(__name__)

print(sys.argv)

lines = [
    'Cycles: 172,173,174,175,176,177,178,179,180,181,182,183,184,185,186,187,188,189,190,191,192,193,194,195,196,197, '
    '198,199,200,201,202,203,204,205,206,207,208,209,210,211,212,213,214,215,216,217,218,219,220,221,222,223,224,225, '
    '226,227,228,229,230,231,232,233,234,235,236,237,238,239,240,241,242,243,244,245,246,247,248,249,250,251,252,253, '
    '254,255,256,257,258,259,260,261,262,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277,278,279,280,281, '
    '282,283,284,285,286,287,288,289,290,291,292,293,294,295,296,297,298,299,300,301,302,303,304,305,306,307,308,309, '
    '310,311,312,313,314,315,316,317,318,319,320,321,322',
    "Sample: #0 'unknown' 'Undetermined' [default]",
    "Sample: #15 'IASJD_781_646' '0042972780'\n [1239129012309123123]",
    "Barcode: 'ACACAGGTGG+ACAACGCTCA'",
    "Sample: #16 'IASJD_781_647' '0042972781' [1239129012309123123]",
    "Barcode: 'CCTGCGGAAC+AGCCTATGAT'",
    "Sample: #17 'IASJD_781_648' '0042972782' [1239129012309123123]"
]

for i in range(1, 31):
    try:
        k = random.randint(0, len(lines) - 1)
        print(lines[k])
        if i % 5 == 0:
            for j in range(100):
                print(f'Tile: {i} (index: {j}, skipped tiles: 0)')

        if i % 10 == 0:
            for j in range(30):
                print(
                    '"/path/to/conversions/aj903njncqw91'
                    '/1239129012309123123/Reports/html/HGGWWDSX7'
                    '/1239129012309123123/0042972642/unknown"')

        time.sleep(random.randint(5, 30) / 10)

        if i % 8 == 0:
            raise ValueError('loop error')
        if i % 6 == 0:
            logger.warning(f'warning - {i}')
    except Exception as e:
        logger.error(f'exception in loop', exc_info=e)
