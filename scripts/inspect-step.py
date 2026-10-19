"""Read a STEP assembly without changing it; export a numbered CAD review snapshot.

Requires cadquery-ocp==7.9.3.1.1. Output is local review material, not production assets.
"""
import argparse
import hashlib
import json
import mmap
import re
import time
from collections import Counter
from pathlib import Path


def step_products(source):
    """Keep original legacy Chinese names independently of the CAD reader's codec."""
    with source.open('rb') as stream:
        with mmap.mmap(stream.fileno(), 0, access=mmap.ACCESS_READ) as data:
            pattern = rb"#(\d+)\s*=\s*(PRODUCT|PRODUCT_DEFINITION|PRODUCT_DEFINITION_FORMATION|PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE|NEXT_ASSEMBLY_USAGE_OCCURRENCE)\s*\([^;]*;"
            rows = {int(m[1]): (m[2].decode(), m[0].decode('gb18030'))
                    for m in re.finditer(pattern, data)}
    products, formations, definitions, edges = {}, {}, {}, []
    for entity, (kind, text) in rows.items():
        refs = [int(ref) for ref in re.findall(r'#(\d+)', text)][1:]
        if kind == 'PRODUCT':
            products[entity] = re.findall(r"'((?:[^']|'')*)'", text)[1].replace("''", "'")
        elif kind.startswith('PRODUCT_DEFINITION_FORMATION'):
            formations[entity] = refs[-1]
        elif kind == 'PRODUCT_DEFINITION':
            definitions[entity] = refs[0]
        else:
            edges.append((entity, refs[-2], refs[-1]))
    roots = {a for _, a, _ in edges} - {b for _, _, b in edges}
    if len(roots) != 1:
        raise ValueError(f'Expected one root assembly, found {len(roots)}')
    root = roots.pop()
    # STEPCAF assigns instance names from NEXT_ASSEMBLY_USAGE_OCCURRENCE identifiers.
    names = {str(entity): products[formations[definitions[child]]]
             for entity, _, child in edges}
    occurrence_names = {re.findall(r"'((?:[^']|'')*)'", rows[entity][1])[0]: names[str(entity)]
                        for entity, _, _ in edges}
    return {'products': len(products), 'instances': len(edges), 'names': names,
            'occurrence_names': occurrence_names,
            'top_names': [products[formations[definitions[b]]] for _, a, b in edges if a == root]}


def bbox(shape):
    from OCP.Bnd import Bnd_Box
    from OCP.BRepBndLib import BRepBndLib
    box = Bnd_Box()
    BRepBndLib.Add_s(shape, box, False)
    if box.IsVoid():
        raise ValueError('Empty shape bounds')
    return [round(value, 4) for value in box.Get()]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--mesh', action='store_true')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    metadata = step_products(args.source)
    print(f'TEXT: {metadata["products"]} products, {metadata["instances"]} instances', flush=True)

    from OCP.STEPCAFControl import STEPCAFControl_Reader
    from OCP.TDocStd import TDocStd_Document
    from OCP.TCollection import TCollection_ExtendedString
    from OCP.TDataStd import TDataStd_Name
    from OCP.TDF import TDF_LabelSequence
    from OCP.XCAFDoc import XCAFDoc_DocumentTool, XCAFDoc_ShapeTool
    from OCP.IFSelect import IFSelect_RetDone

    document = TDocStd_Document(TCollection_ExtendedString('MRF CAD review'))
    reader = STEPCAFControl_Reader()
    reader.SetNameMode(True)
    reader.SetColorMode(True)
    print('READ: loading CAD entities', flush=True)
    if reader.ReadFile(str(args.source.resolve())) != IFSelect_RetDone:
        raise RuntimeError('STEP read failed')
    print('TRANSFER: constructing shapes', flush=True)
    if not reader.Transfer(document):
        raise RuntimeError('STEP transfer failed')
    tool = XCAFDoc_DocumentTool.ShapeTool_s(document.Main())
    roots = TDF_LabelSequence()
    tool.GetFreeShapes(roots)
    if roots.Length() != 1:
        raise ValueError(f'CAD root count: {roots.Length()}')
    root = roots.Value(1)
    components = TDF_LabelSequence()
    XCAFDoc_ShapeTool.GetComponents_s(root, components)
    if components.Length() != len(metadata['top_names']):
        raise ValueError('Text and CAD assembly component counts differ')

    def label_name(label):
        attr = TDataStd_Name()
        return attr.Get().ToExtString() if label.FindAttribute(TDataStd_Name.GetID_s(), attr) else ''

    rows = []
    for index in range(1, components.Length() + 1):
        component = components.Value(index)
        raw = label_name(component)
        # Resolve identity through the original STEP occurrence reference, not import order
        # or re-decoding already-decoded Chinese labels from the CAD kernel.
        original = metadata['occurrence_names'].get(raw)
        if original is None:
            raise ValueError(f'Cannot match CAD occurrence {raw!r} to original STEP')
        bounds = bbox(XCAFDoc_ShapeTool.GetShape_s(component))
        code = f'E{index:02d}'
        TDataStd_Name.Set_s(component, TCollection_ExtendedString(code))
        row = {'id': code, 'name': original, 'cad_instance_name': raw,
               'bounds_mm': bounds,
               'center_mm': [round((bounds[i] + bounds[i+3]) / 2, 3) for i in range(3)],
               'size_mm': [round(bounds[i+3] - bounds[i], 3) for i in range(3)]}
        rows.append(row)
        print(code, original, row['size_mm'], flush=True)
    if Counter(row['name'] for row in rows) != Counter(metadata['top_names']):
        raise ValueError('CAD occurrence names differ from original STEP assembly')
    with args.source.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    report = {'source': args.source.name, 'bytes': args.source.stat().st_size,
              'sha256': digest,
              'units': 'mm', 'bounds_mm': bbox(XCAFDoc_ShapeTool.GetShape_s(root)),
              'products': metadata['products'], 'instances': metadata['instances'],
              'top_level': rows, 'text_top_names': metadata['top_names']}
    (args.output / 'inventory.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'INVENTORY: {time.monotonic()-started:.1f}s', flush=True)

    if args.mesh:
        from OCP.BRepMesh import BRepMesh_IncrementalMesh
        from OCP.RWGltf import RWGltf_CafWriter
        from OCP.TColStd import TColStd_IndexedDataMapOfStringString
        from OCP.Message import Message_ProgressRange
        # Absolute millimetres: coarse enough for review; does not modify the STEP source.
        print('MESH: absolute deflection 8 mm, angular deflection 0.5 rad', flush=True)
        mesh = BRepMesh_IncrementalMesh(XCAFDoc_ShapeTool.GetShape_s(root), 8.0, False, 0.5, True)
        if not mesh.IsDone():
            raise RuntimeError('CAD triangulation failed')
        writer = RWGltf_CafWriter(str((args.output / 'plant.glb').resolve()), True)
        if not writer.Perform(document, TColStd_IndexedDataMapOfStringString(), Message_ProgressRange()):
            raise RuntimeError('GLB export failed')
        print(f'EXPORTED: {time.monotonic()-started:.1f}s', flush=True)


if __name__ == '__main__':
    main()
