import 'package:flutter/material.dart';

import '../generated/api.g.dart';

class ManualPreviewDialog extends StatefulWidget {
  final List<AssetView> assets;
  const ManualPreviewDialog({super.key, required this.assets});
  @override
  State<ManualPreviewDialog> createState() => _ManualPreviewDialogState();
}

class _ManualPreviewDialogState extends State<ManualPreviewDialog> {
  String? _selected;
  @override
  Widget build(BuildContext context) {
    final options = widget.assets
        .where(
          (a) =>
              a.status == 'READY' &&
              a.scanStatus == 'CLEAN' &&
              [
                'image/png',
                'image/jpeg',
                'image/webp',
                'application/pdf',
              ].contains(a.mime),
        )
        .toList();
    return AlertDialog(
      title: const Text('Prévia manual do ZIP'),
      content: SizedBox(
        width: 440,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Escolha uma imagem ou PDF enviado nesta versão. Ele será processado com marca e exibido como prévia do ZIP.',
            ),
            const SizedBox(height: 16),
            if (options.isEmpty)
              const Text(
                'Envie primeiro uma imagem ou PDF pelo botão Enviar arquivo nesta versão.',
              ),
            if (options.isNotEmpty)
              DropdownButtonFormField<String>(
                isExpanded: true,
                decoration: const InputDecoration(
                  labelText: 'Imagem ou PDF desta versão',
                ),
                items: options
                    .map(
                      (a) => DropdownMenuItem(
                        value: a.id,
                        child: Text(
                          a.fileName,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    )
                    .toList(),
                onChanged: (value) => setState(() => _selected = value),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, ''),
          child: const Text('Remover prévia manual'),
        ),
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          onPressed: _selected == null
              ? null
              : () => Navigator.pop(context, _selected),
          child: const Text('Vincular prévia'),
        ),
      ],
    );
  }
}
