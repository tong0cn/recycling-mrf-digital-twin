"""Small regression fixtures for STEP assembly identity and legacy Chinese names."""
import importlib.util
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('inspect_step', Path(__file__).with_name('inspect-step.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class AssemblyTests(unittest.TestCase):
    def parse(self, text):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'fixture.STEP'
            source.write_bytes(text.encode('gb18030'))
            return module.step_products(source)

    def test_repeated_instances_keep_chinese_names_and_assembly_identity(self):
        result = self.parse("""
#1 = PRODUCT ('总装', '总装', '', (#100));
#2 = PRODUCT_DEFINITION_FORMATION ('', '', #1);
#3 = PRODUCT_DEFINITION ('design', '', #2, #100);
#4 = PRODUCT ('料仓', '料仓', '', (#100));
#5 = PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE ('', '', #4, .NOT_KNOWN.);
#6 = PRODUCT_DEFINITION ('design', '', #5, #100);
#7 = NEXT_ASSEMBLY_USAGE_OCCURRENCE ('1', '左仓', '', #3, #6, $);
#8 = NEXT_ASSEMBLY_USAGE_OCCURRENCE (
  '2', '右仓', '', #3, #6, $);
""")
        self.assertEqual(result['products'], 2)
        self.assertEqual(result['instances'], 2)
        self.assertEqual(result['top_names'], ['料仓', '料仓'])
        self.assertEqual(result['names'], {'7': '料仓', '8': '料仓'})
        self.assertEqual(result['occurrence_names'], {'1': '料仓', '2': '料仓'})

    def test_missing_assembly_root_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'one root assembly'):
            self.parse("#1 = PRODUCT ('零件', '零件', '', (#100));")


if __name__ == '__main__':
    unittest.main()
